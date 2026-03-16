import {
  DEFAULT_CRITICAL_THRESHOLD,
  DEFAULT_SLEEP_THRESHOLD,
  getEnergyState,
  persistEnergyState,
  type EnergyState,
} from "./energy_system.js";
import { loadOrganismState, saveOrganismState, type OrganismState } from "./state_manager.js";
import { TaskQueue } from "../tasks/task_queue.js";
import { createMaintenanceTask, createSleepTask, tasksFromAutonomyPlan, tasksFromEvolvePlan, type Task } from "../tasks/task_types.js";
import { scoreTask, sortTasksByScore, type TaskScoringWeights, DEFAULT_TASK_WEIGHTS } from "../tasks/task_scoring.js";
import type { EvolvePlan } from "../system/evolve.js";
import { generateCuriosityTasks } from "../curiosity/curiosity_engine.js";
import { collectAgentFollowUpTasks } from "../agents/agent_followup.js";
import { getRecentSpawnLog, listActiveAgents, spawnAgentWithReason } from "../agents/agent_manager.js";
import { immuneSystem, toGateResult } from "../immune/immune_system.js";
import { loadBehaviorContext } from "./behavior_context.js";
import type { AgentTaskInput } from "../agents/agent_types.js";

export interface OrganismLoopOptions {
  now?: () => Date;
  evolvePlans?: EvolvePlan[];
  autonomyPlans?: Array<{ objective: string; plan: EvolvePlan }>;
  maintenanceContexts?: string[];
  sleepContexts?: string[];
  candidates?: Task[];
  weights?: TaskScoringWeights;
  sleepThreshold?: number;
  criticalEnergyThreshold?: number;
  includeCuriosity?: boolean;
  allowAgentSpawn?: boolean;
  maxAgents?: number;
  spawnEnergyBuffer?: number;
}

export interface OrganismLoopResult {
  ranAt: string;
  selectedTask?: Task;
  tasksConsidered: number;
  energy: EnergyState;
}

interface SpawnDecision {
  input: AgentTaskInput;
  reason: string;
}

const DEFAULT_MAX_AGENTS = 2;
const DEFAULT_SPAWN_ENERGY_BUFFER = 12;

function normalizeGoal(goal: string): string {
  return goal.trim().toLowerCase();
}

function isUrgentUserTask(tasks: Task[]): boolean {
  return tasks.some((task) => task.type === "user_task" && task.priority >= 8);
}

function selectDelegationForTask(task: Task): SpawnDecision | undefined {
  const goal = normalizeGoal(task.goal);
  if (task.type === "sleep_task") {
    if (goal.startsWith("maintenance:") && (goal.includes("test") || goal.includes("validate") || goal.includes("coverage"))) {
      return {
        input: { type: "test_runner", goal: task.goal, allowed_tools: ["filesystem:read", "process:run"], parent: "organism" },
        reason: "maintenance validation",
      };
    }
    return undefined;
  }
  if (task.type === "mutation_task" || task.type === "user_task") {
    return undefined;
  }
  if (task.type === "curiosity_task") {
    if (goal.includes("explore_codebase") || goal.includes("codebase") || goal.includes("structure")) {
      return {
        input: { type: "code_analyzer", goal: task.goal, allowed_tools: ["filesystem:read"], parent: "organism" },
        reason: "curiosity code exploration",
      };
    }
    return {
      input: { type: "researcher", goal: task.goal, allowed_tools: ["filesystem:read"], parent: "organism" },
      reason: "curiosity research",
    };
  }
  if (task.type === "project_task") {
    if (goal.includes("analy") || goal.includes("audit") || goal.includes("inspect")) {
      return {
        input: { type: "code_analyzer", goal: task.goal, allowed_tools: ["filesystem:read"], parent: "organism" },
        reason: "project inspection",
      };
    }
    if (goal.includes("discover") || goal.includes("context") || goal.includes("research")) {
      return {
        input: { type: "researcher", goal: task.goal, allowed_tools: ["filesystem:read"], parent: "organism" },
        reason: "project context discovery",
      };
    }
  }
  return undefined;
}

function isDuplicateSpawn(
  candidates: Array<{ goal: string; type: string }>,
  goal: string,
  type: string,
): boolean {
  const normalizedGoal = normalizeGoal(goal);
  return candidates.some(
    (entry) => normalizeGoal(entry.goal) === normalizedGoal && entry.type === type,
  );
}

export function collectCandidateTasks(options: OrganismLoopOptions): Task[] {
  const candidates: Task[] = [];
  if (options.candidates && options.candidates.length > 0) {
    candidates.push(...options.candidates);
  }
  for (const plan of options.evolvePlans || []) {
    candidates.push(...tasksFromEvolvePlan(plan));
  }
  for (const entry of options.autonomyPlans || []) {
    candidates.push(...tasksFromAutonomyPlan(entry.objective, entry.plan));
  }
  for (const context of options.maintenanceContexts || []) {
    candidates.push(createMaintenanceTask(context));
  }
  for (const context of options.sleepContexts || []) {
    candidates.push(createSleepTask(context));
  }
  return candidates;
}

export function selectNextTask(
  tasks: Task[],
  currentEnergy: number,
  weights: TaskScoringWeights = DEFAULT_TASK_WEIGHTS,
): Task | undefined {
  if (tasks.length === 0) return undefined;
  const ordered = sortTasksByScore(tasks, currentEnergy, weights);
  return ordered[0];
}

export function exposeSelectedTask(
  task: Task | undefined,
  currentEnergy = 100,
  weights: TaskScoringWeights = DEFAULT_TASK_WEIGHTS,
): string {
  if (!task) return "No task selected.";
  const score = scoreTask(task, currentEnergy, weights);
  return `Task ${task.id} | ${task.type} | ${task.goal} | score=${score}`;
}

export async function runOrganismTick(rootDir: string, options: OrganismLoopOptions = {}): Promise<OrganismLoopResult> {
  const now = options.now ? options.now() : new Date();
  const state = await loadOrganismState(rootDir);
  const energy = await getEnergyState(rootDir);
  const behaviorContext = await loadBehaviorContext(rootDir);
  const weights = options.weights || behaviorContext.taskWeights || DEFAULT_TASK_WEIGHTS;
  const candidates = collectCandidateTasks(options);
  const sleepThreshold = options.sleepThreshold ?? DEFAULT_SLEEP_THRESHOLD;
  const criticalEnergyThreshold = options.criticalEnergyThreshold ?? DEFAULT_CRITICAL_THRESHOLD;
  const agentFollowUps = await collectAgentFollowUpTasks(rootDir);
  if (agentFollowUps.length > 0) {
    const validated: Task[] = [];
    for (const task of agentFollowUps) {
      const inputCheck = immuneSystem.validateInput(task.goal);
      const inputGate = toGateResult(inputCheck, "input_validator");
      if (!inputGate.allowed) {
        console.warn(`[IMMUNE] Rejected follow-up task ${task.id}: ${inputGate.reason || "blocked"}`);
        continue;
      }
      if (task.goal.includes("src/") || task.goal.includes("brain/")) {
        const fsCheck = await immuneSystem.validateFilesystemAccess(rootDir, "src", "read");
        const fsGate = toGateResult(fsCheck, "filesystem_guard");
        if (!fsGate.allowed) {
          console.warn(`[IMMUNE] Rejected follow-up task ${task.id}: ${fsGate.reason || "blocked"}`);
          continue;
        }
      }
      validated.push(task);
    }
    if (validated.length > 0) {
      candidates.push(...validated);
    }
  }
  const includeCuriosity = options.includeCuriosity ?? process.env.HATCHLING_DISABLE_CURIOSITY !== "1";
  if (includeCuriosity) {
    const curiosityTasks = await generateCuriosityTasks(rootDir, energy.level, sleepThreshold, {
      now: options.now,
      behaviorContext,
    });
    candidates.push(...curiosityTasks);
  }
  if (energy.level <= sleepThreshold) {
    candidates.push(
      createSleepTask("energy low", {
        priority: energy.level <= criticalEnergyThreshold ? 10 : 8,
        energyCost: 1,
        minEnergyRequired: 0,
      }),
    );
  }
  const availableTasks = candidates.filter((task) => task.minEnergyRequired <= energy.level);
  const queue = new TaskQueue(availableTasks);
  let selectedTask: Task | undefined;
  if (energy.level <= criticalEnergyThreshold) {
    selectedTask = availableTasks.find((task) => task.type === "sleep_task");
  }
  if (!selectedTask) {
    selectedTask = selectNextTask(queue.list(), energy.level, weights);
  }

  const allowAgentSpawn = options.allowAgentSpawn ?? true;
  if (allowAgentSpawn && selectedTask) {
    const urgentUserTask = isUrgentUserTask(availableTasks);
    const spawnBuffer = options.spawnEnergyBuffer ?? DEFAULT_SPAWN_ENERGY_BUFFER;
    const safeEnergyThreshold = sleepThreshold + spawnBuffer + (behaviorContext.strategyPreference === "cautious" ? 5 : 0);
    const activeAgents = await listActiveAgents(rootDir);
    const maxAgents = options.maxAgents ?? DEFAULT_MAX_AGENTS;
    const delegation = selectDelegationForTask(selectedTask);
    const recentSpawn = await getRecentSpawnLog(rootDir, 10);
    const duplicate = delegation
      ? isDuplicateSpawn(
          [
            ...activeAgents.map((agent) => ({ goal: agent.goal, type: agent.type })),
            ...recentSpawn.map((entry) => ({ goal: entry.goal, type: entry.agentType })),
          ],
          delegation.input.goal,
          delegation.input.type,
        )
      : false;
    const shouldSpawn =
      delegation &&
      energy.level > safeEnergyThreshold &&
      activeAgents.length < maxAgents &&
      !urgentUserTask &&
      selectedTask.type !== "mutation_task" &&
      !duplicate;
    if (shouldSpawn && delegation) {
      await spawnAgentWithReason(rootDir, delegation.input, delegation.reason);
    }
  }
  const updatedState: OrganismState = {
    ...state,
    lastTickAt: now.toISOString(),
    energy: {
      level: energy.level,
      lowEnergy: energy.lowEnergy,
      lastUpdatedAt: energy.lastUpdatedAt,
      tokensUsedToday: energy.tokensUsedToday,
      tokensBudgetDaily: energy.tokensBudgetDaily,
    },
    tasks: {
      lastSelectedTaskId: selectedTask?.id,
      queueDepth: queue.size(),
    },
  };

  updatedState.selectedTask = selectedTask
    ? {
        id: selectedTask.id,
        type: selectedTask.type,
        goal: selectedTask.goal,
        score: scoreTask(selectedTask, energy.level, weights),
        selectedAt: now.toISOString(),
      }
    : undefined;

  await persistEnergyState(rootDir, energy);
  await saveOrganismState(rootDir, updatedState);

  return {
    ranAt: now.toISOString(),
    selectedTask,
    tasksConsidered: queue.size(),
    energy,
  };
}
