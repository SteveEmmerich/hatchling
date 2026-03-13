import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";
import { createTask, type Task } from "../tasks/task_types.js";

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
}

export const CURIOSITY_STATE_FILE = "brain/curiosity.json";

const DEFAULT_STATE: CuriosityState = {
  curiosity: 5,
  exploration_bias: 0.4,
  learning_bias: 0.35,
  mutation_bias: 0.25,
  last_exploration: undefined,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeBias(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function scoreBiases(state: CuriosityState): Array<{ kind: CuriosityTaskKind; score: number }> {
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
    score: entry.score * (0.6 + curiosityScale * 0.4),
  }));
}

function resolveWeights(state: CuriosityState): Array<{ kind: CuriosityTaskKind; weight: number }> {
  const scored = scoreBiases(state);
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

function priorityForKind(kind: CuriosityTaskKind, curiosity: number): number {
  const base = 3 + Math.round(clamp(curiosity, 0, 10) / 3);
  if (kind === "propose_mutation") return Math.max(3, base - 1);
  if (kind === "self_reflect") return Math.max(2, base - 2);
  return Math.min(8, base);
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
    return { ...DEFAULT_STATE };
  }
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as Partial<CuriosityState>;
    return {
      curiosity: clamp(Number(parsed.curiosity ?? DEFAULT_STATE.curiosity), 0, 10),
      exploration_bias: normalizeBias(Number(parsed.exploration_bias ?? DEFAULT_STATE.exploration_bias)),
      learning_bias: normalizeBias(Number(parsed.learning_bias ?? DEFAULT_STATE.learning_bias)),
      mutation_bias: normalizeBias(Number(parsed.mutation_bias ?? DEFAULT_STATE.mutation_bias)),
      last_exploration: parsed.last_exploration,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveCuriosityState(rootDir: string, state: CuriosityState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(CURIOSITY_STATE_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
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
  const weights = resolveWeights(state);
  const kinds = pickTopKinds(weights, 2);
  const tasks = kinds.map((kind) =>
    createTask({
      type: "curiosity_task",
      goal: `${kind}: ${goalForKind(kind)}`,
      priority: priorityForKind(kind, state.curiosity),
      energyCost: energyCostForKind(kind),
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
