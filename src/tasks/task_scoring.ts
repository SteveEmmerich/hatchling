import type { Task } from "./task_types.js";

export interface TaskScoringWeights {
  priority: number;
  energyCost: number;
  curiosityBonus: number;
  mutationPenalty: number;
  sleepBoost: number;
  projectBoost: number;
  userBoost: number;
}

export const DEFAULT_TASK_WEIGHTS: TaskScoringWeights = {
  priority: 1.0,
  energyCost: 1.0,
  curiosityBonus: 0.6,
  mutationPenalty: 0.7,
  sleepBoost: 0.8,
  projectBoost: 0.4,
  userBoost: 0.6,
};

export function scoreTask(
  task: Task,
  currentEnergy: number,
  weights: TaskScoringWeights = DEFAULT_TASK_WEIGHTS,
): number {
  const base = task.priority * weights.priority - task.energyCost * weights.energyCost;
  let modifier = 0;
  if (task.type === "curiosity_task") modifier += weights.curiosityBonus;
  if (task.type === "mutation_task") modifier -= weights.mutationPenalty;
  if (task.type === "sleep_task") modifier += weights.sleepBoost;
  if (task.type === "project_task") modifier += weights.projectBoost;
  if (task.type === "user_task") modifier += weights.userBoost;
  const safeEnergy = Math.max(1, Number(currentEnergy || 0));
  const energyPenalty = task.energyCost / safeEnergy;
  return Number((base + modifier - energyPenalty).toFixed(3));
}

export function sortTasksByScore(
  tasks: Task[],
  currentEnergy: number,
  weights: TaskScoringWeights = DEFAULT_TASK_WEIGHTS,
): Task[] {
  return [...tasks].sort(
    (a, b) => scoreTask(b, currentEnergy, weights) - scoreTask(a, currentEnergy, weights),
  );
}
