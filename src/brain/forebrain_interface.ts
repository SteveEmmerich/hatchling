import {
  type BrainResult,
  type ReasoningOutput,
  type HindbrainFallbackInput,
} from "./hindbrain_interface.js";

export interface PlanningInput {
  goal: string;
  context?: string[];
  constraints?: string[];
  posture?: string;
}

export interface ReasoningInput {
  prompt: string;
  context?: string[];
  posture?: string;
}

export interface SynthesisInput {
  items: string[];
  goal?: string;
  posture?: string;
}

export type ForebrainResponder = (prompt: string) => Promise<string>;

export interface ForebrainInterface {
  kind: "forebrain";
  isAvailable(): Promise<boolean>;
  plan(input: PlanningInput): Promise<BrainResult<ReasoningOutput>>;
  reason(input: ReasoningInput): Promise<BrainResult<ReasoningOutput>>;
  synthesize(input: SynthesisInput): Promise<BrainResult<ReasoningOutput>>;
}

function extractBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s+/, "").trim())
    .filter((line) => line.length > 0);
}

function buildReasoningOutput(text: string): ReasoningOutput {
  return { text, bullets: extractBullets(text) };
}

async function respond(
  responder: ForebrainResponder | undefined,
  prompt: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (!responder) {
    return { ok: false, error: "Forebrain unavailable" };
  }
  try {
    const response = await responder(prompt);
    const cleaned = String(response || "").trim();
    if (!cleaned) {
      return { ok: false, error: "Forebrain returned empty response" };
    }
    return { ok: true, text: cleaned };
  } catch (error: any) {
    return { ok: false, error: error?.message || "Forebrain request failed" };
  }
}

export function createForebrainInterface(options: {
  responder?: ForebrainResponder;
  availabilityCheck?: () => Promise<boolean>;
} = {}): ForebrainInterface {
  const responder = options.responder;
  return {
    kind: "forebrain",
    async isAvailable(): Promise<boolean> {
      if (options.availabilityCheck) {
        try {
          return Boolean(await options.availabilityCheck());
        } catch {
          return false;
        }
      }
      return Boolean(responder);
    },
    async plan(input: PlanningInput): Promise<BrainResult<ReasoningOutput>> {
      const prompt = [
        "Create a concise plan.",
        `Goal: ${input.goal}`,
        input.constraints?.length ? `Constraints: ${input.constraints.join(", ")}` : "",
        input.context?.length ? `Context: ${input.context.join(" | ")}` : "",
        input.posture ? `Posture: ${input.posture}` : "",
        "Respond with steps or bullets.",
      ]
        .filter(Boolean)
        .join("\n");
      const response = await respond(responder, prompt);
      if (!response.ok || !response.text) {
        return { ok: false, source: "forebrain", error: response.error };
      }
      return { ok: true, source: "forebrain", data: buildReasoningOutput(response.text), raw: response.text };
    },
    async reason(input: ReasoningInput): Promise<BrainResult<ReasoningOutput>> {
      const prompt = [
        "Provide a concise reasoning response.",
        input.context?.length ? `Context: ${input.context.join(" | ")}` : "",
        input.posture ? `Posture: ${input.posture}` : "",
        `Prompt: ${input.prompt}`,
      ]
        .filter(Boolean)
        .join("\n");
      const response = await respond(responder, prompt);
      if (!response.ok || !response.text) {
        return { ok: false, source: "forebrain", error: response.error };
      }
      return { ok: true, source: "forebrain", data: buildReasoningOutput(response.text), raw: response.text };
    },
    async synthesize(input: SynthesisInput): Promise<BrainResult<ReasoningOutput>> {
      const prompt = [
        "Synthesize the following items into a short response.",
        input.goal ? `Goal: ${input.goal}` : "",
        `Items: ${input.items.join(" | ")}`,
        input.posture ? `Posture: ${input.posture}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const response = await respond(responder, prompt);
      if (!response.ok || !response.text) {
        return { ok: false, source: "forebrain", error: response.error };
      }
      return { ok: true, source: "forebrain", data: buildReasoningOutput(response.text), raw: response.text };
    },
  };
}

export function buildHindbrainFallbackInput(
  input: PlanningInput | ReasoningInput | SynthesisInput,
): HindbrainFallbackInput {
  if ("items" in input) {
    const context = [...input.items];
    if (input.posture) context.push(`Posture: ${input.posture}`);
    return { prompt: `Synthesize: ${input.goal || "summary"}`, context };
  }
  if ("goal" in input && !("prompt" in input)) {
    const context = [...(input.context || []), ...(input.constraints || [])];
    if (input.posture) context.push(`Posture: ${input.posture}`);
    return {
      prompt: `Plan for: ${input.goal}`,
      context,
    };
  }
  const reasoning = input as ReasoningInput;
  const context = [...(reasoning.context || [])];
  if (reasoning.posture) context.push(`Posture: ${reasoning.posture}`);
  return { prompt: reasoning.prompt, context };
}
