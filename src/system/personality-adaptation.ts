import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface PersonalitySignals {
  confidence: number;
  caution: number;
  warmth: number;
  stress: number;
}

export interface PersonalityAdjustment {
  at: string;
  sentiment: "positive" | "negative";
  context?: string;
  delta: PersonalitySignals;
}

export interface PersonalityState {
  version: number;
  baseTraits: string[];
  adaptiveTraits: string[];
  signals: PersonalitySignals;
  totalFeedback: number;
  lastUpdatedAt: string;
  adjustments: PersonalityAdjustment[];
}

const PERSONALITY_STATE_FILE = "brain/personality_state.json";

function clampSignal(value: number): number {
  if (value < 0) return 0;
  if (value > 10) return 10;
  return Number(value.toFixed(2));
}

function normalizeTraits(input: string[]): string[] {
  const unique = new Set(
    input.map((trait) => trait.trim().toLowerCase()).filter(Boolean),
  );
  return Array.from(unique).slice(0, 16);
}

export function defaultPersonalityState(baseTraits: string[] = ["curious", "loyal"]): PersonalityState {
  const now = new Date().toISOString();
  return {
    version: 1,
    baseTraits: normalizeTraits(baseTraits),
    adaptiveTraits: [],
    signals: {
      confidence: 5,
      caution: 4,
      warmth: 5,
      stress: 3,
    },
    totalFeedback: 0,
    lastUpdatedAt: now,
    adjustments: [],
  };
}

export function personalityStatePath(rootDir: string): string {
  return path.join(rootDir, PERSONALITY_STATE_FILE);
}

export async function loadPersonalityState(rootDir: string, baseTraits: string[] = []): Promise<PersonalityState> {
  const target = personalityStatePath(rootDir);
  if (!existsSync(target)) {
    const defaults = defaultPersonalityState(baseTraits);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(defaults, null, 2), "utf-8");
    return defaults;
  }
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as PersonalityState;
    if (!parsed || !parsed.signals) {
      return defaultPersonalityState(baseTraits);
    }
    parsed.baseTraits = normalizeTraits(parsed.baseTraits || baseTraits);
    parsed.adaptiveTraits = normalizeTraits(parsed.adaptiveTraits || []);
    parsed.signals = {
      confidence: clampSignal(Number(parsed.signals.confidence ?? 5)),
      caution: clampSignal(Number(parsed.signals.caution ?? 4)),
      warmth: clampSignal(Number(parsed.signals.warmth ?? 5)),
      stress: clampSignal(Number(parsed.signals.stress ?? 3)),
    };
    parsed.totalFeedback = Number(parsed.totalFeedback || 0);
    parsed.adjustments = Array.isArray(parsed.adjustments) ? parsed.adjustments.slice(-100) : [];
    parsed.lastUpdatedAt = String(parsed.lastUpdatedAt || new Date().toISOString());
    return parsed;
  } catch {
    return defaultPersonalityState(baseTraits);
  }
}

export async function savePersonalityState(rootDir: string, state: PersonalityState): Promise<void> {
  const target = personalityStatePath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

function deriveAdaptiveTraits(signals: PersonalitySignals): string[] {
  const traits: string[] = [];
  if (signals.confidence >= 7) traits.push("bold");
  if (signals.caution >= 7) traits.push("careful");
  if (signals.warmth >= 7) traits.push("empathetic");
  if (signals.stress >= 7) traits.push("reserved");
  if (signals.stress <= 2) traits.push("steady");
  return normalizeTraits(traits);
}

function feedbackDelta(sentiment: "positive" | "negative", context: string | undefined): PersonalitySignals {
  const text = String(context || "").toLowerCase();
  if (sentiment === "positive") {
    return {
      confidence: text.includes("bold") || text.includes("autonomous") ? 1.1 : 0.6,
      caution: -0.2,
      warmth: text.includes("helpful") || text.includes("kind") ? 1.0 : 0.4,
      stress: -0.6,
    };
  }
  return {
    confidence: -0.7,
    caution: text.includes("danger") || text.includes("risk") ? 1.2 : 0.8,
    warmth: -0.2,
    stress: text.includes("urgent") || text.includes("broken") ? 1.3 : 0.9,
  };
}

export async function adaptPersonalityFromFeedback(
  rootDir: string,
  sentiment: "positive" | "negative",
  context?: string,
): Promise<PersonalityState> {
  const current = await loadPersonalityState(rootDir);
  const delta = feedbackDelta(sentiment, context);
  current.signals.confidence = clampSignal(current.signals.confidence + delta.confidence);
  current.signals.caution = clampSignal(current.signals.caution + delta.caution);
  current.signals.warmth = clampSignal(current.signals.warmth + delta.warmth);
  current.signals.stress = clampSignal(current.signals.stress + delta.stress);
  current.totalFeedback += 1;
  current.lastUpdatedAt = new Date().toISOString();
  current.adjustments.push({
    at: current.lastUpdatedAt,
    sentiment,
    context,
    delta,
  });
  if (current.adjustments.length > 100) {
    current.adjustments = current.adjustments.slice(-100);
  }
  current.adaptiveTraits = deriveAdaptiveTraits(current.signals);
  await savePersonalityState(rootDir, current);
  return current;
}

export function styleReplyForPersonality(baseText: string, state: PersonalityState): string {
  const text = baseText.trim();
  if (!text) return text;
  if (state.signals.stress >= 8) return `Proceeding carefully. ${text}`;
  if (state.signals.warmth >= 8) return `Happy to help. ${text}`;
  if (state.signals.confidence >= 8) return `Absolutely. ${text}`;
  if (state.signals.caution >= 8) return `Safety check first. ${text}`;
  return text;
}
