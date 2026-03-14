import { generateResponse, type HindbrainConfig } from "./hindbrain.js";
import { runHindbrainDiscovery } from "../system/hindbrain-discovery.js";
import { parseIdentity, type Identity } from "../system/identity-schema.js";

export type BrainSource = "hindbrain" | "forebrain";

export interface BrainResult<T> {
  ok: boolean;
  data?: T;
  source: BrainSource;
  fallback?: boolean;
  error?: string;
  raw?: string;
}

export interface ReasoningOutput {
  text: string;
  bullets: string[];
}

export interface HindbrainOnboardingInput {
  seedIdentity?: Partial<Identity>;
}

export interface HomeostasisInput {
  energy: {
    level: number;
    sleepThreshold: number;
    criticalThreshold: number;
  };
  pendingTasks?: number;
  lastSleepAt?: string;
}

export interface HomeostasisDecision {
  action: "sleep" | "rest" | "continue";
  urgency: "low" | "medium" | "high";
  reason: string;
}

export interface ReflectionInput {
  events: string[];
  tone?: string;
}

export interface ReflectionResult {
  summary: string;
  insights: string[];
}

export interface CuriosityCalibrationInput {
  currentCuriosity: number;
  stress?: number;
  caution?: number;
  feedbackDelta?: number;
}

export interface CuriosityCalibrationResult {
  adjustedCuriosity: number;
  reason: string;
}

export interface MutationSuggestionInput {
  goal: string;
  constraints?: string[];
  signals?: {
    curiosity?: number;
    trust?: number;
  };
}

export interface MutationSuggestionResult {
  suggestion: string;
  confidence: number;
}

export interface SleepSummaryInput {
  completedTasks?: string[];
  pendingTasks?: string[];
  energyLevel?: number;
}

export interface SleepSummaryResult {
  summary: string;
}

export interface HindbrainFallbackInput {
  prompt: string;
  context?: string[];
}

export type HindbrainResponder = (prompt: string, config?: HindbrainConfig) => Promise<string>;

export interface HindbrainInterface {
  kind: "hindbrain";
  onboardIdentity(input: HindbrainOnboardingInput): Promise<BrainResult<Identity>>;
  decideHomeostasis(input: HomeostasisInput): Promise<BrainResult<HomeostasisDecision>>;
  reflect(input: ReflectionInput): Promise<BrainResult<ReflectionResult>>;
  calibrateCuriosity(input: CuriosityCalibrationInput): Promise<BrainResult<CuriosityCalibrationResult>>;
  suggestMutation(input: MutationSuggestionInput): Promise<BrainResult<MutationSuggestionResult>>;
  summarizeForSleep(input: SleepSummaryInput): Promise<BrainResult<SleepSummaryResult>>;
  fallbackReasoning(input: HindbrainFallbackInput): Promise<BrainResult<ReasoningOutput>>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s+/, "").trim())
    .filter((line) => line.length > 0);
}

async function respondWithFallback(
  responder: HindbrainResponder | undefined,
  prompt: string,
  fallback: string,
  config?: HindbrainConfig,
): Promise<{ text: string; raw?: string }> {
  if (!responder) {
    return { text: fallback };
  }
  try {
    const response = await responder(prompt, config);
    const cleaned = String(response || "").trim();
    if (!cleaned) return { text: fallback };
    return { text: cleaned, raw: cleaned };
  } catch {
    return { text: fallback };
  }
}

function buildHomeostasisDecision(input: HomeostasisInput): HomeostasisDecision {
  const level = normalizeNumber(input.energy?.level, 0);
  const sleepThreshold = normalizeNumber(input.energy?.sleepThreshold, 10);
  const criticalThreshold = normalizeNumber(input.energy?.criticalThreshold, 5);
  const pendingTasks = normalizeNumber(input.pendingTasks, 0);

  if (level <= criticalThreshold) {
    return {
      action: "sleep",
      urgency: "high",
      reason: `Energy is critically low (${level}). Prioritizing immediate rest.`,
    };
  }

  if (level <= sleepThreshold) {
    return {
      action: "rest",
      urgency: "medium",
      reason: `Energy is low (${level}). Slowing down to recover before handling ${pendingTasks} tasks.`,
    };
  }

  return {
    action: "continue",
    urgency: "low",
    reason: `Energy is stable (${level}). Safe to proceed with ${pendingTasks} pending tasks.`,
  };
}

function buildCuriosityAdjustment(input: CuriosityCalibrationInput): CuriosityCalibrationResult {
  const current = clamp(normalizeNumber(input.currentCuriosity, 5), 0, 10);
  const stress = clamp(normalizeNumber(input.stress, 5), 0, 10);
  const caution = clamp(normalizeNumber(input.caution, 5), 0, 10);
  const feedbackDelta = clamp(normalizeNumber(input.feedbackDelta, 0), -5, 5);

  const stressPenalty = (stress - 5) / 4;
  const cautionPenalty = (caution - 5) / 4;
  const next = clamp(current + feedbackDelta - stressPenalty - cautionPenalty, 0, 10);
  const reason = `Curiosity adjusted from ${current.toFixed(1)} to ${next.toFixed(1)} based on stress ${stress.toFixed(
    1,
  )}, caution ${caution.toFixed(1)}, feedback ${feedbackDelta.toFixed(1)}.`;

  return { adjustedCuriosity: next, reason };
}

function buildMutationSuggestionFallback(input: MutationSuggestionInput): MutationSuggestionResult {
  const constraints = input.constraints?.length ? ` Constraints: ${input.constraints.join(", ")}.` : "";
  const suggestion = `Consider a small mutation that supports "${input.goal}".${constraints}`.trim();
  const curiosity = clamp(normalizeNumber(input.signals?.curiosity, 5), 0, 10);
  const confidence = clamp(0.4 + curiosity / 20, 0, 0.9);
  return { suggestion, confidence };
}

function buildSleepSummaryFallback(input: SleepSummaryInput): SleepSummaryResult {
  const completed = input.completedTasks?.length ? input.completedTasks.join("; ") : "No completed tasks recorded";
  const pending = input.pendingTasks?.length ? input.pendingTasks.join("; ") : "No pending tasks recorded";
  const energy = normalizeNumber(input.energyLevel, 0);
  return {
    summary: `Sleep summary: completed=${completed}. pending=${pending}. energy=${energy}.`,
  };
}

function buildReflectionFallback(input: ReflectionInput): ReflectionResult {
  const summary = input.events.length ? input.events.join("; ") : "No recent events recorded.";
  return { summary, insights: [] };
}

export function createHindbrainInterface(options: {
  responder?: HindbrainResponder;
  discovery?: () => Promise<Identity>;
} = {}): HindbrainInterface {
  const responder = options.responder ?? generateResponse;
  const discovery = options.discovery ?? runHindbrainDiscovery;

  return {
    kind: "hindbrain",
    async onboardIdentity(input: HindbrainOnboardingInput): Promise<BrainResult<Identity>> {
      if (input.seedIdentity) {
        try {
          const identity = parseIdentity({
            name: input.seedIdentity.name,
            purpose: input.seedIdentity.purpose,
            personality: input.seedIdentity.personality,
          });
          return { ok: true, data: identity, source: "hindbrain" };
        } catch (error: any) {
          return {
            ok: false,
            source: "hindbrain",
            error: error?.message || "Invalid seed identity",
          };
        }
      }
      try {
        const identity = await discovery();
        return { ok: true, data: identity, source: "hindbrain" };
      } catch (error: any) {
        return {
          ok: false,
          source: "hindbrain",
          error: error?.message || "Hindbrain onboarding failed",
        };
      }
    },
    async decideHomeostasis(input: HomeostasisInput): Promise<BrainResult<HomeostasisDecision>> {
      const decision = buildHomeostasisDecision(input);
      return { ok: true, data: decision, source: "hindbrain" };
    },
    async reflect(input: ReflectionInput): Promise<BrainResult<ReflectionResult>> {
      const fallback = buildReflectionFallback(input);
      const prompt = [
        "Summarize the following events into a short reflection and 1-3 insights.",
        `Tone: ${input.tone || "practical"}`,
        `Events: ${input.events.join(" | ") || "none"}`,
        "Respond with a short paragraph and optional bullet insights.",
      ].join("\n");
      const response = await respondWithFallback(responder, prompt, fallback.summary, { temperature: 0.4, maxTokens: 200 });
      const insights = extractBullets(response.text);
      return {
        ok: true,
        data: { summary: response.text, insights },
        source: "hindbrain",
        raw: response.raw,
      };
    },
    async calibrateCuriosity(input: CuriosityCalibrationInput): Promise<BrainResult<CuriosityCalibrationResult>> {
      const result = buildCuriosityAdjustment(input);
      return { ok: true, data: result, source: "hindbrain" };
    },
    async suggestMutation(input: MutationSuggestionInput): Promise<BrainResult<MutationSuggestionResult>> {
      const fallback = buildMutationSuggestionFallback(input);
      const prompt = [
        "Suggest a single mutation idea for the organism.",
        `Goal: ${input.goal}`,
        input.constraints?.length ? `Constraints: ${input.constraints.join(", ")}` : "",
        "Reply with one short sentence.",
      ]
        .filter(Boolean)
        .join("\n");
      const response = await respondWithFallback(responder, prompt, fallback.suggestion, { temperature: 0.5, maxTokens: 120 });
      const confidence = fallback.confidence;
      return {
        ok: true,
        data: { suggestion: response.text, confidence },
        source: "hindbrain",
        raw: response.raw,
      };
    },
    async summarizeForSleep(input: SleepSummaryInput): Promise<BrainResult<SleepSummaryResult>> {
      const fallback = buildSleepSummaryFallback(input);
      const prompt = [
        "Create a compact sleep summary for the organism.",
        `Completed: ${(input.completedTasks || []).join("; ") || "none"}`,
        `Pending: ${(input.pendingTasks || []).join("; ") || "none"}`,
        `Energy: ${normalizeNumber(input.energyLevel, 0)}`,
      ].join("\n");
      const response = await respondWithFallback(responder, prompt, fallback.summary, { temperature: 0.3, maxTokens: 120 });
      return {
        ok: true,
        data: { summary: response.text },
        source: "hindbrain",
        raw: response.raw,
      };
    },
    async fallbackReasoning(input: HindbrainFallbackInput): Promise<BrainResult<ReasoningOutput>> {
      const prompt = [
        "Provide a concise response that keeps the organism moving.",
        input.context?.length ? `Context: ${input.context.join(" | ")}` : "",
        `Request: ${input.prompt}`,
      ]
        .filter(Boolean)
        .join("\n");
      const fallbackText = `Request noted: ${input.prompt}. Proceed with a minimal safe response.`;
      const response = await respondWithFallback(responder, prompt, fallbackText, { temperature: 0.4, maxTokens: 200 });
      return {
        ok: true,
        data: { text: response.text, bullets: extractBullets(response.text) },
        source: "hindbrain",
        raw: response.raw,
      };
    },
  };
}
