import { deriveEnergyState, persistEnergyState, type EnergyState } from "./energy_system.js";
import { loadOrganismState, saveOrganismState, type OrganismState } from "./state_manager.js";
import { TaskQueue } from "../tasks/task_queue.js";
import { createMaintenanceTask, createSleepTask, tasksFromAutonomyPlan, tasksFromEvolvePlan, type Task } from "../tasks/task_types.js";
import { scoreTask, sortTasksByScore, type TaskScoringWeights, DEFAULT_TASK_WEIGHTS } from "../tasks/task_scoring.js";
import type { EvolvePlan } from "../system/evolve.js";

export interface OrganismLoopOptions {
  now?: () => Date;
  evolvePlans?: EvolvePlan[];
  autonomyPlans?: Array<{ objective: string; plan: EvolvePlan }>;
  maintenanceContexts?: string[];
  sleepContexts?: string[];
  candidates?: Task[];
  weights?: TaskScoringWeights;
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

export function selectNextTask(tasks: Task[], weights: TaskScoringWeights = DEFAULT_TASK_WEIGHTS): Task | undefined {
  if (tasks.length === 0) return undefined;
  const ordered = sortTasksByScore(tasks, weights);
  return ordered[0];
}

export function exposeSelectedTask(
  task: Task | undefined,
  weights: TaskScoringWeights = DEFAULT_TASK_WEIGHTS,
): string {
  if (!task) return "No task selected.";
  const score = scoreTask(task, weights);
  return `Task ${task.id} | ${task.type} | ${task.goal} | score=${score}`;
}

export async function runOrganismTick(rootDir: string, options: OrganismLoopOptions = {}): Promise<OrganismLoopResult> {
  const now = options.now ? options.now() : new Date();
  const state = await loadOrganismState(rootDir);
  const energy = await deriveEnergyState(rootDir);
  const weights = options.weights || DEFAULT_TASK_WEIGHTS;
  const candidates = collectCandidateTasks(options);
  const queue = new TaskQueue(candidates);
  const selectedTask = selectNextTask(queue.list(), weights);
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
        score: scoreTask(selectedTask, weights),
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
