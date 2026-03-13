import crypto from "node:crypto";
import type { EvolveAction, EvolvePlan } from "../system/evolve.js";

export type TaskType =
  | "user_task"
  | "project_task"
  | "curiosity_task"
  | "mutation_task"
  | "sleep_task";

export interface Task {
  id: string;
  type: TaskType;
  goal: string;
  priority: number;
  energyCost: number;
  minEnergyRequired: number;
  createdAt: string;
}

export interface TaskInput {
  type: TaskType;
  goal: string;
  priority: number;
  energyCost: number;
  minEnergyRequired?: number;
  createdAt?: string;
  id?: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function createTask(input: TaskInput): Task {
  if (!input || typeof input !== "object") {
    throw new Error("Task input is required.");
  }
  const goal = String(input.goal || "").trim();
  if (!goal) {
    throw new Error("Task goal is required.");
  }
  const type = input.type;
  if (!type) {
    throw new Error("Task type is required.");
  }
  const priority = clamp(Number(input.priority), 0, 10);
  const energyCost = clamp(Number(input.energyCost), 0, 10);
  const minEnergyRequired = clamp(
    Number(
      input.minEnergyRequired ?? (type === "sleep_task" ? 0 : Math.round(energyCost * 10)),
    ),
    0,
    100,
  );
  const createdAt = input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString();
  const id = input.id || crypto.randomUUID();

  return {
    id,
    type,
    goal,
    priority,
    energyCost,
    minEnergyRequired,
    createdAt,
  };
}

function describeEvolveAction(action: EvolveAction): string {
  const params = action.params && Object.keys(action.params).length > 0
    ? ` (${Object.keys(action.params).join(", ")})`
    : "";
  return `${action.type}${params}`;
}

export function taskFromEvolveAction(
  action: EvolveAction,
  goalContext: string,
  overrides: Partial<Omit<TaskInput, "type" | "goal">> = {},
): Task {
  let type: TaskType = "project_task";
  if (action.type === "mutate_web_limb") type = "mutation_task";
  if (action.type === "maintenance_tick") type = "sleep_task";
  if (action.type === "install_skill" || action.type === "enable_capability" || action.type === "bootstrap_channel") {
    type = "project_task";
  }
  if (action.type === "add_mcp") type = "project_task";

  const goal = `${goalContext}: ${describeEvolveAction(action)}`;
  return createTask({
    type,
    goal,
    priority: overrides.priority ?? 5,
    energyCost: overrides.energyCost ?? (type === "sleep_task" ? 2 : type === "mutation_task" ? 7 : 5),
    createdAt: overrides.createdAt,
    id: overrides.id,
  });
}

export function tasksFromEvolvePlan(
  plan: EvolvePlan,
  overrides: Partial<Omit<TaskInput, "type" | "goal">> = {},
): Task[] {
  return plan.actions.map((action) => taskFromEvolveAction(action, plan.goal, overrides));
}

export function tasksFromAutonomyPlan(
  objective: string,
  plan: EvolvePlan,
  overrides: Partial<Omit<TaskInput, "type" | "goal">> = {},
): Task[] {
  return plan.actions.map((action) => taskFromEvolveAction(action, objective, overrides));
}

export function createMaintenanceTask(context: string, overrides: Partial<Omit<TaskInput, "type" | "goal">> = {}): Task {
  return createTask({
    type: "sleep_task",
    goal: `maintenance: ${context}`,
    priority: overrides.priority ?? 4,
    energyCost: overrides.energyCost ?? 2,
    createdAt: overrides.createdAt,
    id: overrides.id,
  });
}

export function createSleepTask(context: string, overrides: Partial<Omit<TaskInput, "type" | "goal">> = {}): Task {
  return createTask({
    type: "sleep_task",
    goal: `sleep: ${context}`,
    priority: overrides.priority ?? 6,
    energyCost: overrides.energyCost ?? 1,
    createdAt: overrides.createdAt,
    id: overrides.id,
  });
}
