import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";
import { DEFAULT_TASK_WEIGHTS, type TaskScoringWeights } from "../tasks/task_scoring.js";
import { loadPersonalityState } from "../system/personality-adaptation.js";
import { loadCuriosityState } from "../curiosity/curiosity_engine.js";
import { loadSocialMemory } from "../memory/social_memory.js";
import type { ReflectionSignalState } from "../brain/reflection_engine.js";

export interface TraitSignals {
  curiosity: number;
  confidence: number;
  trust: number;
  planningDepth: number;
  riskTolerance: number;
  toolBias: number;
  reflectionFrequency: number;
}

export interface TraitState {
  version: 1;
  traits: TraitSignals;
  updatedAt: string;
}

export interface Habit {
  key: string;
  weight: number;
  description?: string;
  lastObservedAt?: string;
  count?: number;
}

export interface HabitState {
  version: 1;
  habits: Habit[];
}

export interface SelfModel {
  version: 1;
  identity: {
    name: string;
    purpose: string;
    personality: string[];
  };
  strengths: string[];
  weaknesses: string[];
  preferences: {
    planningStyle: "plan-first" | "balanced" | "act-first";
    riskPosture: "cautious" | "balanced" | "bold";
    toolPreference: "light" | "balanced" | "heavy";
  };
  updatedAt: string;
}

export interface ReflectionSignalSummary {
  confidenceDelta: number;
  curiosityDelta: number;
  trustDelta: number;
}

export interface BehaviorContext {
  traits: TraitState;
  habits: HabitState;
  selfModel: SelfModel;
  reflection: ReflectionSignalSummary;
  strategyPreference: "plan-first" | "balanced" | "act-first" | "cautious";
  responseStyle: {
    tone: "cautious" | "neutral" | "confident";
    riskTolerance: number;
  };
  taskWeights: TaskScoringWeights;
}

const TRAITS_FILE = "brain/dna/traits.json";
const HABITS_FILE = "brain/dna/habits.json";
const SELF_MODEL_FILE = "brain/self/self_model.json";
const REFLECTION_SIGNALS_FILE = "brain/reflection_signals.json";

function nowIso(): string {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function canWriteBrain(): boolean {
  return Boolean(process.env.HATCHLING_INTERNAL_WRITE) || process.env.HATCHLING_CONTEXT === "cli";
}

function normalizeTraits(input: string[]): string[] {
  const unique = new Set(
    input.map((trait) => String(trait || "").trim().toLowerCase()).filter(Boolean),
  );
  return Array.from(unique).slice(0, 16);
}

function defaultTraitSignals(): TraitSignals {
  return {
    curiosity: 5,
    confidence: 5,
    trust: 50,
    planningDepth: 5,
    riskTolerance: 5,
    toolBias: 5,
    reflectionFrequency: 5,
  };
}

async function deriveTraitSignals(rootDir: string): Promise<TraitSignals> {
  const personality = await loadPersonalityState(rootDir);
  const curiosity = await loadCuriosityState(rootDir);
  const curiosityStatePath = path.join(rootDir, "brain", "curiosity_state.json");
  let adjustedCuriosity = Number(curiosity.curiosity ?? 5);
  if (existsSync(curiosityStatePath)) {
    try {
      const parsed = JSON.parse(await fs.readFile(curiosityStatePath, "utf-8")) as { adjustedCuriosity?: number };
      if (Number.isFinite(Number(parsed.adjustedCuriosity))) {
        adjustedCuriosity = Number(parsed.adjustedCuriosity);
      }
    } catch {
      // Ignore invalid curiosity_state.json.
    }
  }
  const social = await loadSocialMemory(rootDir);
  const trustValues = Object.values(social.users || {}).map((user) => Number(user.trust || 50));
  const trustAverage = trustValues.length
    ? trustValues.reduce((sum, value) => sum + value, 0) / trustValues.length
    : 50;
  const caution = clamp(Number(personality.signals.caution ?? 4), 0, 10);
  const riskTolerance = clamp(10 - caution, 0, 10);
  return {
    curiosity: clamp(adjustedCuriosity, 0, 10),
    confidence: clamp(Number(personality.signals.confidence ?? 5), 0, 10),
    trust: clamp(Number(trustAverage || 50), 0, 100),
    planningDepth: clamp(Number(personality.signals.calibration ?? 5), 0, 10),
    riskTolerance,
    toolBias: clamp(Number(personality.signals.warmth ?? 5), 0, 10),
    reflectionFrequency: clamp(Number(personality.signals.stress ? 10 - personality.signals.stress : 5), 0, 10),
  };
}

function sanitizeTraitState(input: unknown, fallback: TraitSignals): TraitState {
  const record = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const traitsRaw = typeof record.traits === "object" && record.traits ? (record.traits as Record<string, unknown>) : {};
  return {
    version: 1,
    traits: {
      curiosity: clamp(Number(traitsRaw.curiosity ?? fallback.curiosity), 0, 10),
      confidence: clamp(Number(traitsRaw.confidence ?? fallback.confidence), 0, 10),
      trust: clamp(Number(traitsRaw.trust ?? fallback.trust), 0, 100),
      planningDepth: clamp(Number(traitsRaw.planningDepth ?? fallback.planningDepth), 0, 10),
      riskTolerance: clamp(Number(traitsRaw.riskTolerance ?? fallback.riskTolerance), 0, 10),
      toolBias: clamp(Number(traitsRaw.toolBias ?? fallback.toolBias), 0, 10),
      reflectionFrequency: clamp(Number(traitsRaw.reflectionFrequency ?? fallback.reflectionFrequency), 0, 10),
    },
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : nowIso(),
  };
}

function sanitizeHabitState(input: unknown): HabitState {
  if (!input || typeof input !== "object") return { version: 1, habits: [] };
  const record = input as Record<string, unknown>;
  const habitsRaw = Array.isArray(record.habits) ? record.habits : [];
  const habits: Habit[] = habitsRaw
    .map((habit) => {
      if (!habit || typeof habit !== "object") return null;
      const entry = habit as Record<string, unknown>;
      const key = String(entry.key || "").trim().toLowerCase();
      if (!key) return null;
      return {
        key,
        weight: clamp(Number(entry.weight ?? 0), 0, 1),
        description: entry.description ? String(entry.description) : undefined,
        lastObservedAt: entry.lastObservedAt ? String(entry.lastObservedAt) : undefined,
        count: Number.isFinite(Number(entry.count)) ? Number(entry.count) : undefined,
      };
    })
    .filter(Boolean) as Habit[];
  return { version: 1, habits };
}

function defaultSelfModel(identity: { name: string; purpose: string; personality: string[] }): SelfModel {
  const now = nowIso();
  const traits = normalizeTraits(identity.personality || []);
  return {
    version: 1,
    identity: {
      name: identity.name || "hatchling",
      purpose: identity.purpose || "To learn and assist",
      personality: traits,
    },
    strengths: traits.slice(0, 3),
    weaknesses: [],
    preferences: {
      planningStyle: "balanced",
      riskPosture: "balanced",
      toolPreference: "balanced",
    },
    updatedAt: now,
  };
}

function sanitizeSelfModel(input: unknown, fallback: SelfModel): SelfModel {
  if (!input || typeof input !== "object") return fallback;
  const record = input as Record<string, unknown>;
  const identityRaw = typeof record.identity === "object" && record.identity ? (record.identity as Record<string, unknown>) : {};
  const strengths = normalizeTraits(Array.isArray(record.strengths) ? record.strengths as string[] : fallback.strengths);
  const weaknesses = normalizeTraits(Array.isArray(record.weaknesses) ? record.weaknesses as string[] : fallback.weaknesses);
  const prefRaw = typeof record.preferences === "object" && record.preferences ? (record.preferences as Record<string, unknown>) : {};
  const planningStyle = String(prefRaw.planningStyle || fallback.preferences.planningStyle) as SelfModel["preferences"]["planningStyle"];
  const riskPosture = String(prefRaw.riskPosture || fallback.preferences.riskPosture) as SelfModel["preferences"]["riskPosture"];
  const toolPreference = String(prefRaw.toolPreference || fallback.preferences.toolPreference) as SelfModel["preferences"]["toolPreference"];
  const normalizedPlanning = planningStyle === "plan-first" || planningStyle === "act-first" ? planningStyle : "balanced";
  const normalizedRisk = riskPosture === "cautious" || riskPosture === "bold" ? riskPosture : "balanced";
  const normalizedTool = toolPreference === "light" || toolPreference === "heavy" ? toolPreference : "balanced";
  return {
    version: 1,
    identity: {
      name: String(identityRaw.name || fallback.identity.name || "hatchling"),
      purpose: String(identityRaw.purpose || fallback.identity.purpose || "To learn and assist"),
      personality: normalizeTraits(Array.isArray(identityRaw.personality) ? identityRaw.personality as string[] : fallback.identity.personality),
    },
    strengths,
    weaknesses,
    preferences: {
      planningStyle: normalizedPlanning,
      riskPosture: normalizedRisk,
      toolPreference: normalizedTool,
    },
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt ? record.updatedAt : fallback.updatedAt,
  };
}

async function loadJson<T>(rootDir: string, relativePath: string): Promise<T | null> {
  const target = path.join(rootDir, relativePath);
  if (!existsSync(target)) return null;
  try {
    return JSON.parse(await fs.readFile(target, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(rootDir: string, relativePath: string, payload: unknown): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(relativePath, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(payload, null, 2), "utf-8");
}

export async function ensureTraitState(rootDir: string): Promise<{ traits: TraitState; habits: HabitState; selfModel: SelfModel }> {
  const derivedTraits = await deriveTraitSignals(rootDir);
  const traitsRaw = await loadJson<TraitState>(rootDir, TRAITS_FILE);
  const traits = sanitizeTraitState(traitsRaw, derivedTraits);

  const habitsRaw = await loadJson<HabitState>(rootDir, HABITS_FILE);
  const habits = sanitizeHabitState(habitsRaw);

  const identityConfig = await loadJson<{ name?: string; purpose?: string }>(rootDir, "brain/config.json");
  const personality = await loadPersonalityState(rootDir);
  const selfDefault = defaultSelfModel({
    name: identityConfig?.name || "hatchling",
    purpose: identityConfig?.purpose || "To learn and assist",
    personality: personality.baseTraits || [],
  });
  const selfRaw = await loadJson<SelfModel>(rootDir, SELF_MODEL_FILE);
  const selfModel = sanitizeSelfModel(selfRaw, selfDefault);

  if (canWriteBrain()) {
    await fs.mkdir(path.join(rootDir, "brain", "dna"), { recursive: true });
    await fs.mkdir(path.join(rootDir, "brain", "self"), { recursive: true });
    await writeJson(rootDir, TRAITS_FILE, traits);
    await writeJson(rootDir, HABITS_FILE, habits);
    await writeJson(rootDir, SELF_MODEL_FILE, selfModel);
  }

  return { traits, habits, selfModel };
}

export function deriveStrategyPreference(traits: TraitSignals, selfModel: SelfModel): BehaviorContext["strategyPreference"] {
  if (selfModel.strengths.some((trait) => trait.includes("plan") || trait.includes("strateg"))) {
    return "plan-first";
  }
  if (traits.confidence <= 3 || selfModel.weaknesses.some((trait) => trait.includes("uncertain"))) {
    return "cautious";
  }
  if (selfModel.preferences.planningStyle === "act-first" && traits.riskTolerance >= 6) {
    return "act-first";
  }
  return "balanced";
}

function habitWeight(habits: HabitState, key: string): number {
  return habits.habits
    .filter((habit) => habit.key === key)
    .reduce((sum, habit) => sum + habit.weight, 0);
}

export function deriveTaskWeightsFromTraits(
  traits: TraitSignals,
  habits: HabitState,
  selfModel: SelfModel,
  base: TaskScoringWeights = DEFAULT_TASK_WEIGHTS,
): TaskScoringWeights {
  const curiosityBoost = (traits.curiosity - 5) / 10;
  const cautionPenalty =
    traits.riskTolerance <= 4 ? 0.1 : traits.riskTolerance >= 7 ? -0.1 : 0;
  const habitCuriosity = habitWeight(habits, "favor_curiosity");
  const habitRest = habitWeight(habits, "favor_rest");
  const habitMutation = habitWeight(habits, "favor_mutation") - habitWeight(habits, "avoid_mutation");
  const planBias = selfModel.preferences.planningStyle === "plan-first" ? 0.1 : 0;
  const userBias = traits.trust < 45 ? 0.1 : 0;

  return {
    ...base,
    curiosityBonus: clamp(base.curiosityBonus + curiosityBoost * 0.2 + habitCuriosity * 0.2, 0.2, 1.2),
    mutationPenalty: clamp(base.mutationPenalty + cautionPenalty - habitMutation * 0.2, 0.2, 1.2),
    sleepBoost: clamp(base.sleepBoost + (traits.confidence < 4 ? 0.2 : 0) + habitRest * 0.2, 0.2, 1.2),
    projectBoost: clamp(base.projectBoost + planBias, 0.1, 1.0),
    userBoost: clamp(base.userBoost + userBias, 0.2, 1.2),
    priority: base.priority,
    energyCost: base.energyCost,
  };
}

async function loadReflectionSignalSummary(rootDir: string): Promise<ReflectionSignalSummary> {
  const state = await loadJson<ReflectionSignalState>(rootDir, REFLECTION_SIGNALS_FILE);
  if (!state || !Array.isArray(state.signals)) return { confidenceDelta: 0, curiosityDelta: 0, trustDelta: 0 };
  const recent = state.signals.slice(-10);
  return {
    confidenceDelta: recent.reduce((sum: number, entry) => sum + Number(entry.confidenceDelta || 0), 0),
    curiosityDelta: recent.reduce((sum: number, entry) => sum + Number(entry.curiosityDelta || 0), 0),
    trustDelta: recent.reduce((sum: number, entry) => sum + Number(entry.trustDelta || 0), 0),
  };
}

export async function loadBehaviorContext(rootDir: string): Promise<BehaviorContext> {
  const { traits, habits, selfModel } = await ensureTraitState(rootDir);
  const reflection = await loadReflectionSignalSummary(rootDir);
  const strategyPreference = deriveStrategyPreference(traits.traits, selfModel);
  const tone: "cautious" | "neutral" | "confident" =
    traits.traits.confidence <= 3 ? "cautious" : traits.traits.confidence >= 7 ? "confident" : "neutral";
  const responseStyle = {
    tone,
    riskTolerance: traits.traits.riskTolerance,
  };
  const taskWeights = deriveTaskWeightsFromTraits(traits.traits, habits, selfModel);
  return { traits, habits, selfModel, reflection, strategyPreference, responseStyle, taskWeights };
}
