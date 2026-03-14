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
}

export interface OrganismLoopResult {
  ranAt: string;
  selectedTask?: Task;
  tasksConsidered: number;
  energy: EnergyState;
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
  const weights = options.weights || DEFAULT_TASK_WEIGHTS;
  const candidates = collectCandidateTasks(options);
  const sleepThreshold = options.sleepThreshold ?? DEFAULT_SLEEP_THRESHOLD;
  const criticalEnergyThreshold = options.criticalEnergyThreshold ?? DEFAULT_CRITICAL_THRESHOLD;
  const agentFollowUps = await collectAgentFollowUpTasks(rootDir);
  if (agentFollowUps.length > 0) {
    candidates.push(...agentFollowUps);
  }
  const includeCuriosity = options.includeCuriosity ?? process.env.HATCHLING_DISABLE_CURIOSITY !== "1";
  if (includeCuriosity) {
    const curiosityTasks = await generateCuriosityTasks(rootDir, energy.level, sleepThreshold, { now: options.now });
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
