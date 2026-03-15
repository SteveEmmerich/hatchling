import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";
import { createTask, type Task } from "../tasks/task_types.js";
import type { BehaviorContext } from "../organism/behavior_context.js";

export type CuriosityTaskKind =
  | "explore_codebase"
  | "learn_topic"
  | "run_experiment"
  | "self_reflect"
  | "propose_mutation";

export interface CuriosityState {
  curiosity: number;
  exploration_bias: number;
  learning_bias: number;
  mutation_bias: number;
  last_exploration?: string;
}

export interface CuriosityOptions {
  now?: () => Date;
  behaviorContext?: BehaviorContext;
}

export const CURIOSITY_STATE_FILE = "brain/curiosity.json";

function defaultCuriosityState(now: Date = new Date()): CuriosityState {
  return {
    curiosity: 5,
    exploration_bias: 0.4,
    learning_bias: 0.35,
    mutation_bias: 0.25,
    last_exploration: now.toISOString(),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeBias(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function sanitizeCuriosityState(input: unknown, now: Date = new Date()): { state: CuriosityState; repaired: boolean } {
  if (!input || typeof input !== "object") {
    return { state: defaultCuriosityState(now), repaired: true };
  }
  const record = input as Record<string, unknown>;
  const curiosity = clamp(Number(record.curiosity ?? 5), 0, 10);
  const exploration_bias = normalizeBias(Number(record.exploration_bias ?? 0.4));
  const learning_bias = normalizeBias(Number(record.learning_bias ?? 0.35));
  const mutation_bias = normalizeBias(Number(record.mutation_bias ?? 0.25));
  const last_exploration =
    typeof record.last_exploration === "string" && record.last_exploration.trim()
      ? record.last_exploration
      : now.toISOString();

  const state: CuriosityState = {
    curiosity,
    exploration_bias,
    learning_bias,
    mutation_bias,
    last_exploration,
  };

  const repaired =
    curiosity !== Number(record.curiosity) ||
    exploration_bias !== Number(record.exploration_bias) ||
    learning_bias !== Number(record.learning_bias) ||
    mutation_bias !== Number(record.mutation_bias) ||
    last_exploration !== record.last_exploration;

  return { state, repaired };
}

function scoreBiases(state: CuriosityState, habitBias = 0): Array<{ kind: CuriosityTaskKind; score: number }> {
  const curiosityScale = clamp(state.curiosity, 0, 10) / 10;
  const entries = [
    { kind: "explore_codebase" as const, score: normalizeBias(state.exploration_bias) * 1.05 },
    { kind: "learn_topic" as const, score: normalizeBias(state.learning_bias) * 1.0 },
    { kind: "run_experiment" as const, score: normalizeBias(state.exploration_bias) * 0.9 },
    { kind: "self_reflect" as const, score: 0.2 + curiosityScale * 0.6 },
    { kind: "propose_mutation" as const, score: normalizeBias(state.mutation_bias) * 0.85 },
  ];
  return entries.map((entry) => ({
    kind: entry.kind,
    score: entry.score * (0.6 + curiosityScale * 0.4) * (1 + habitBias),
  }));
}

function resolveWeights(state: CuriosityState, habitBias = 0): Array<{ kind: CuriosityTaskKind; weight: number }> {
  const scored = scoreBiases(state, habitBias);
  const total = scored.reduce((sum, entry) => sum + entry.score, 0);
  if (total <= 0) {
    return scored.map((entry) => ({ kind: entry.kind, weight: 0.2 }));
  }
  return scored.map((entry) => ({ kind: entry.kind, weight: entry.score / total }));
}

function pickTopKinds(
  weights: Array<{ kind: CuriosityTaskKind; weight: number }>,
  limit: number,
): CuriosityTaskKind[] {
  return [...weights]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((entry) => entry.kind);
}

function goalForKind(kind: CuriosityTaskKind): string {
  switch (kind) {
    case "explore_codebase":
      return "Explore the codebase for potential improvements.";
    case "learn_topic":
      return "Learn a relevant topic to improve future planning.";
    case "run_experiment":
      return "Run a small experiment to validate assumptions.";
    case "self_reflect":
      return "Reflect on recent behavior and summarize learnings.";
    case "propose_mutation":
      return "Propose a safe mutation for future review.";
    default:
      return "Explore something new.";
  }
}

function priorityForKind(kind: CuriosityTaskKind, curiosity: number, habitBoost = 0): number {
  const base = 3 + Math.round(clamp(curiosity, 0, 10) / 3);
  if (kind === "propose_mutation") return Math.max(3, base - 1);
  if (kind === "self_reflect") return Math.max(2, base - 2);
  return Math.min(8, base + Math.round(habitBoost));
}

function energyCostForKind(kind: CuriosityTaskKind): number {
  switch (kind) {
    case "explore_codebase":
      return 4;
    case "learn_topic":
      return 3;
    case "run_experiment":
      return 5;
    case "self_reflect":
      return 2;
    case "propose_mutation":
      return 6;
    default:
      return 3;
  }
}

export async function loadCuriosityState(rootDir: string): Promise<CuriosityState> {
  const target = path.join(rootDir, CURIOSITY_STATE_FILE);
  if (!existsSync(target)) {
    return defaultCuriosityState();
  }
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8"));
    return sanitizeCuriosityState(parsed).state;
  } catch {
    return defaultCuriosityState();
  }
}

export async function saveCuriosityState(rootDir: string, state: CuriosityState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(CURIOSITY_STATE_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

export async function ensureCuriosityState(rootDir: string, options: CuriosityOptions = {}): Promise<CuriosityState> {
  const now = options.now ? options.now() : new Date();
  const target = path.join(rootDir, CURIOSITY_STATE_FILE);
  let parsed: unknown = null;
  let exists = false;
  if (existsSync(target)) {
    exists = true;
    try {
      parsed = JSON.parse(await fs.readFile(target, "utf-8"));
    } catch {
      parsed = null;
    }
  }
  const { state, repaired } = sanitizeCuriosityState(parsed, now);
  if (!exists || repaired) {
    await saveCuriosityState(rootDir, state);
  }
  return state;
}

export async function generateCuriosityTasks(
  rootDir: string,
  currentEnergy: number,
  sleepThreshold: number,
  options: CuriosityOptions = {},
): Promise<Task[]> {
  if (currentEnergy <= sleepThreshold) return [];
  const state = await loadCuriosityState(rootDir);
  const now = options.now ? options.now() : new Date();
  const habits = options.behaviorContext?.habits?.habits || [];
  const habitBoost = habits
    .filter((habit) => habit.key === "favor_curiosity" || habit.key === "favor_exploration")
    .reduce((sum, habit) => sum + habit.weight, 0);
  const mutationBias = habits
    .filter((habit) => habit.key === "avoid_mutation")
    .reduce((sum, habit) => sum + habit.weight, 0);
  const weights = resolveWeights(state, clamp(habitBoost, 0, 0.3));
  const kinds = pickTopKinds(weights, 2);
  const effectiveCuriosity = options.behaviorContext?.traits?.traits?.curiosity ?? state.curiosity;
  const tasks = kinds.map((kind) =>
    createTask({
      type: "curiosity_task",
      goal: `${kind}: ${goalForKind(kind)}`,
      priority: priorityForKind(kind, effectiveCuriosity, habitBoost),
      energyCost: Math.max(
        1,
        energyCostForKind(kind) + (kind === "propose_mutation" ? Math.round(mutationBias) : 0),
      ),
      minEnergyRequired: Math.min(100, sleepThreshold + 1),
    }),
  );

  const updatedState: CuriosityState = {
    ...state,
    last_exploration: now.toISOString(),
  };
  await saveCuriosityState(rootDir, updatedState);
  return tasks;
}
