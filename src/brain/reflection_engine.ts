import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";
import {
  recordEpisodeEntry,
  getRecentEpisodes,
  storeKnowledgeEntry,
  updateSocialMemoryEntry,
  appendNarrativeEntry,
  loadNarrativeMemory,
} from "../memory/memory_manager.js";
import { loadSocialMemory } from "../memory/social_memory.js";
import { createHindbrainInterface } from "./hindbrain_interface.js";

export type ReflectionEventType =
  | "task"
  | "sleep"
  | "autonomy"
  | "feedback"
  | "agent"
  | "system";

export interface ReflectionKnowledge {
  key: string;
  value: string;
  confidence?: number;
  source?: string;
}

export interface ReflectionUserSignal {
  id: string;
  channel?: string;
  text?: string;
  sentiment?: "positive" | "negative" | "neutral";
  trustDelta?: number;
}

export interface ReflectionAgentResult {
  id?: string;
  type?: string;
  summary?: string;
  success?: boolean;
}

export interface ReflectionContext {
  taskId?: string;
  taskType?: string;
  goal?: string;
  metadata?: Record<string, unknown>;
}

export interface ReflectionInput {
  type: ReflectionEventType;
  outcome?: string;
  result?: string;
  reward?: number;
  agentResult?: ReflectionAgentResult;
  user?: ReflectionUserSignal;
  context?: ReflectionContext;
  knowledge?: ReflectionKnowledge[];
  narrative?: string;
  timestamp?: string;
  allowMutationSuggestion?: boolean;
}

export interface BehavioralAdjustment {
  confidenceDelta: number;
  curiosityDelta: number;
  trustDelta: number;
}

export interface MutationSuggestion {
  suggestion: string;
  confidence: number;
}

export interface ReflectionOutput {
  episodes: Array<{ id: string; event: string; outcome?: string }>;
  semanticUpdates: Array<{ key: string; value: string; confidence: number }>;
  socialUpdates: Array<{ id: string; trust: number; interactionCount: number }>;
  narrativeEntry?: string;
  stateAdjustments: BehavioralAdjustment;
  mutationSuggestions: MutationSuggestion[];
}

export interface ReflectionEngineOptions {
  now?: () => Date;
  suggestMutation?: (input: ReflectionInput) => Promise<MutationSuggestion | null>;
  maxNarrativeLength?: number;
}

interface CuriosityState {
  adjustedCuriosity: number;
  lastCalculated?: string;
  adjustments?: Array<{ timestamp: string; reason: string; delta: number }>;
}

const CURIOSITY_STATE_FILE = "brain/curiosity_state.json";
const REFLECTION_SIGNALS_FILE = "brain/reflection_signals.json";
const MUTATION_SUGGESTIONS_FILE = "brain/mutation_suggestions.json";

export interface ReflectionSignal {
  id: string;
  timestamp: string;
  confidenceDelta: number;
  curiosityDelta: number;
  trustDelta: number;
  userId?: string;
  source?: string;
  consumed?: boolean;
  consumedAt?: string;
}

export interface ReflectionSignalState {
  version: 1;
  signals: ReflectionSignal[];
}

export interface MutationSuggestionRecord {
  id: string;
  suggestion: string;
  confidence: number;
  createdAt: string;
  source?: string;
  status: "pending" | "approved_for_pipeline" | "rejected_for_now";
  reviewedAt?: string;
  reason?: string;
}

export interface MutationSuggestionState {
  version: 1;
  suggestions: MutationSuggestionRecord[];
}

function nowIso(now: Date): string {
  return now.toISOString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeReward(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return clamp(parsed, -1, 1);
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function canWriteBrain(): boolean {
  return Boolean(process.env.HATCHLING_INTERNAL_WRITE) || process.env.HATCHLING_CONTEXT === "cli";
}

function buildEventLabel(input: ReflectionInput): string {
  const goal = normalizeText(input.context?.goal);
  if (goal) return `${input.type}: ${goal}`;
  const taskType = normalizeText(input.context?.taskType);
  if (taskType) return `${input.type}: ${taskType}`;
  return input.type;
}

function buildOutcome(input: ReflectionInput): string {
  const outcome = normalizeText(input.outcome);
  if (outcome) return outcome;
  const result = normalizeText(input.result);
  if (result) return result;
  if (input.agentResult?.summary) return normalizeText(input.agentResult.summary);
  return "Recorded reflection event.";
}

function shouldWriteNarrative(input: ReflectionInput, reward?: number): boolean {
  if (input.narrative) return true;
  if (input.type === "sleep" || input.type === "autonomy") return true;
  if (typeof reward === "number" && Math.abs(reward) >= 0.6) return true;
  const outcome = normalizeText(input.outcome);
  return /\b(success|failed|blocked|complete|milestone)\b/i.test(outcome);
}

async function loadCuriosityState(rootDir: string, now: Date): Promise<CuriosityState> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(CURIOSITY_STATE_FILE, "write");
  if (!existsSync(target)) {
    return { adjustedCuriosity: 5, lastCalculated: nowIso(now), adjustments: [] };
  }
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as CuriosityState;
    const adjusted = Number(parsed.adjustedCuriosity);
    return {
      adjustedCuriosity: Number.isFinite(adjusted) ? adjusted : 5,
      lastCalculated: String(parsed.lastCalculated || nowIso(now)),
      adjustments: Array.isArray(parsed.adjustments) ? parsed.adjustments.slice(-50) : [],
    };
  } catch {
    return { adjustedCuriosity: 5, lastCalculated: nowIso(now), adjustments: [] };
  }
}

async function saveCuriosityState(rootDir: string, state: CuriosityState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(CURIOSITY_STATE_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

function computeBehavioralAdjustments(input: ReflectionInput, reward?: number): BehavioralAdjustment {
  let confidenceDelta = 0;
  let curiosityDelta = 0;
  let trustDelta = 0;

  if (typeof reward === "number") {
    if (reward >= 0.6) confidenceDelta += 0.2;
    if (reward <= -0.2) confidenceDelta -= 0.2;
    if (reward <= -0.2) curiosityDelta += 0.2;
    if (reward >= 0.6) curiosityDelta -= 0.1;
  }

  const sentiment = input.user?.sentiment;
  if (sentiment === "positive") {
    confidenceDelta += 0.1;
    trustDelta += 1;
  } else if (sentiment === "negative") {
    confidenceDelta -= 0.1;
    curiosityDelta += 0.1;
    trustDelta -= 1;
  }

  if (typeof input.user?.trustDelta === "number" && Number.isFinite(input.user.trustDelta)) {
    trustDelta += input.user.trustDelta;
  }

  return {
    confidenceDelta: clamp(confidenceDelta, -0.3, 0.3),
    curiosityDelta: clamp(curiosityDelta, -0.3, 0.3),
    trustDelta: clamp(trustDelta, -3, 3),
  };
}

async function loadReflectionSignals(rootDir: string): Promise<ReflectionSignalState> {
  const target = path.join(rootDir, REFLECTION_SIGNALS_FILE);
  if (!existsSync(target)) return { version: 1, signals: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as ReflectionSignalState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.signals)) {
      return { version: 1, signals: [] };
    }
    return parsed;
  } catch {
    return { version: 1, signals: [] };
  }
}

async function saveReflectionSignals(rootDir: string, state: ReflectionSignalState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(REFLECTION_SIGNALS_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

async function appendReflectionSignal(
  rootDir: string,
  signal: Omit<ReflectionSignal, "id">,
): Promise<void> {
  const state = await loadReflectionSignals(rootDir);
  state.signals.push({
    id: `signal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ...signal,
  });
  if (state.signals.length > 200) {
    state.signals = state.signals.slice(-200);
  }
  await saveReflectionSignals(rootDir, state);
}

async function loadMutationSuggestions(rootDir: string): Promise<MutationSuggestionState> {
  const target = path.join(rootDir, MUTATION_SUGGESTIONS_FILE);
  if (!existsSync(target)) return { version: 1, suggestions: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as MutationSuggestionState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.suggestions)) {
      return { version: 1, suggestions: [] };
    }
    return parsed;
  } catch {
    return { version: 1, suggestions: [] };
  }
}

async function saveMutationSuggestions(rootDir: string, state: MutationSuggestionState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(MUTATION_SUGGESTIONS_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

async function appendMutationSuggestion(
  rootDir: string,
  suggestion: MutationSuggestion,
  source?: string,
): Promise<void> {
  const state = await loadMutationSuggestions(rootDir);
  state.suggestions.push({
    id: `mut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    suggestion: suggestion.suggestion,
    confidence: suggestion.confidence,
    createdAt: new Date().toISOString(),
    source,
    status: "pending",
  });
  if (state.suggestions.length > 200) {
    state.suggestions = state.suggestions.slice(-200);
  }
  await saveMutationSuggestions(rootDir, state);
}

function buildNarrativeEntry(input: ReflectionInput, outcome: string, maxLength: number): string {
  const candidate = input.narrative ? normalizeText(input.narrative) : `${input.type}: ${outcome}`;
  if (candidate.length <= maxLength) return candidate;
  return `${candidate.slice(0, maxLength - 3)}...`;
}

async function maybeSuggestMutation(
  input: ReflectionInput,
  outcome: string,
  options: ReflectionEngineOptions,
): Promise<MutationSuggestion | null> {
  if (!input.allowMutationSuggestion) return null;
  const reward = normalizeReward(input.reward);
  const failed = /\b(fail|failed|blocked|error)\b/i.test(outcome);
  if (!failed && (reward === undefined || reward >= 0)) return null;

  if (options.suggestMutation) {
    return options.suggestMutation(input);
  }

  const hindbrain = createHindbrainInterface();
  const suggestion = await hindbrain.suggestMutation({
    goal: input.context?.goal || outcome,
    constraints: input.context?.taskType ? [input.context.taskType] : [],
    signals: { curiosity: 5 },
  });
  if (!suggestion.ok || !suggestion.data) return null;
  return suggestion.data;
}

export async function reflectEvent(
  rootDir: string,
  input: ReflectionInput,
  options: ReflectionEngineOptions = {},
): Promise<ReflectionOutput> {
  const now = options.now ? options.now() : new Date();
  const reward = normalizeReward(input.reward);
  const eventLabel = buildEventLabel(input);
  const outcome = buildOutcome(input);
  const result: ReflectionOutput = {
    episodes: [],
    semanticUpdates: [],
    socialUpdates: [],
    stateAdjustments: { confidenceDelta: 0, curiosityDelta: 0, trustDelta: 0 },
    mutationSuggestions: [],
  };

  if (!canWriteBrain()) {
    return result;
  }

  if (!eventLabel && !outcome) {
    return result;
  }

  const recent = await getRecentEpisodes(rootDir, 6);
  const duplicate = recent.some(
    (episode) => episode.event === eventLabel && String(episode.outcome || "") === outcome,
  );
  if (!duplicate) {
    const episode = await recordEpisodeEntry(rootDir, {
      event: eventLabel,
      outcome,
      reward: reward,
      context: {
        type: input.type,
        taskType: input.context?.taskType,
        taskId: input.context?.taskId,
        agent: input.agentResult?.type,
      },
      timestamp: input.timestamp || nowIso(now),
    });
    result.episodes.push({ id: episode.id, event: episode.event, outcome: episode.outcome });
  }

  if (input.knowledge) {
    for (const entry of input.knowledge) {
      const key = normalizeText(entry.key);
      const value = normalizeText(entry.value);
      if (!key || !value) continue;
      const stored = await storeKnowledgeEntry(rootDir, key, value, {
        confidence: entry.confidence,
        source: entry.source,
      });
      result.semanticUpdates.push({
        key: stored.key,
        value: stored.value,
        confidence: stored.confidence,
      });
    }
  }

  let trustDeltaApplied = 0;
  if (input.user?.id) {
    const state = await loadSocialMemory(rootDir);
    const userId = input.user.id.toLowerCase();
    const existing = state.users[userId];
    const trustDelta = computeBehavioralAdjustments(input, reward).trustDelta;
    trustDeltaApplied = trustDelta;
    const nextTrust = clamp((existing?.trust ?? 50) + trustDelta, 0, 100);
    const notes = input.user.text && input.user.text.length <= 120 ? [input.user.text.trim()] : [];
    const updated = await updateSocialMemoryEntry(rootDir, userId, {
      trust: nextTrust,
      interactionCount: (existing?.interactionCount ?? 0) + 1,
      lastSeenAt: input.timestamp || nowIso(now),
      notes,
    });
    result.socialUpdates.push({
      id: updated.id,
      trust: updated.trust,
      interactionCount: updated.interactionCount,
    });
  }

  const adjustments = computeBehavioralAdjustments(input, reward);
  adjustments.trustDelta = trustDeltaApplied;
  result.stateAdjustments = adjustments;
  if (Math.abs(adjustments.confidenceDelta) > 0.001 || Math.abs(adjustments.curiosityDelta) > 0.001 || Math.abs(adjustments.trustDelta) > 0.001) {
    await appendReflectionSignal(rootDir, {
      timestamp: input.timestamp || nowIso(now),
      confidenceDelta: adjustments.confidenceDelta,
      curiosityDelta: adjustments.curiosityDelta,
      trustDelta: adjustments.trustDelta,
      userId: input.user?.id,
      source: input.type,
      consumed: false,
    });
  }

  if (shouldWriteNarrative(input, reward)) {
    const entry = buildNarrativeEntry(input, outcome, options.maxNarrativeLength ?? 200);
    const narrative = await loadNarrativeMemory(rootDir);
    if (!narrative.includes(entry)) {
      await appendNarrativeEntry(rootDir, entry);
      result.narrativeEntry = entry;
    }
  }

  const mutation = await maybeSuggestMutation(input, outcome, options);
  if (mutation) {
    result.mutationSuggestions.push(mutation);
    await appendMutationSuggestion(rootDir, mutation, input.type);
  }

  return result;
}

export async function reflectSleepCycle(
  rootDir: string,
  input: {
    day: string;
    telemetryCount: number;
    typeCounts: Record<string, number>;
    timestamp?: string;
  },
  options: ReflectionEngineOptions = {},
): Promise<ReflectionOutput> {
  const summary = Object.entries(input.typeCounts)
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
  return reflectEvent(
    rootDir,
    {
      type: "sleep",
      outcome: `Sleep cycle ${input.day}. Telemetry events analyzed: ${input.telemetryCount}. Event type distribution: ${
        summary || "none"
      }`,
      timestamp: input.timestamp,
      allowMutationSuggestion: false,
    },
    options,
  );
}
