import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { SupportedChannel } from "./channels.js";
import type { PersonalityState } from "./personality-adaptation.js";
import type { SocialUserProfile } from "./social-memory.js";
import type { DialogTurnPlan } from "./dialog-state.js";

interface QualityConfig {
  provider: string;
  model: string;
}

export interface ChannelReplyContext {
  channel: SupportedChannel;
  sender: string;
  inboundText: string;
  routeName: string;
  baseReply: string;
  personality: PersonalityState;
  socialProfile?: SocialUserProfile;
  recentHistory?: string[];
  dialogPlan?: DialogTurnPlan;
}

function configPath(rootDir: string): string {
  return path.join(rootDir, "brain", "config.json");
}

async function loadConfig(rootDir: string): Promise<QualityConfig> {
  const target = configPath(rootDir);
  if (!existsSync(target)) return { provider: "hindbrain", model: "hindbrain-1b" };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as Record<string, any>;
    return {
      provider: String(parsed.provider || "hindbrain"),
      model: String(parsed.model || "hindbrain-1b"),
    };
  } catch {
    return { provider: "hindbrain", model: "hindbrain-1b" };
  }
}

function fallbackQualityReply(context: ChannelReplyContext): string {
  const base = context.baseReply.trim();
  if (!base) return "";
  const interactions = Number(context.socialProfile?.interactions || 0);
  let response = base;
  if (context.socialProfile?.inferredTone === "urgent") {
    response = `Priority noted. ${response}`;
  }
  if (context.socialProfile?.relationshipStage === "trusted") {
    response = `Welcome back. ${response}`;
  }
  if (context.socialProfile?.relationshipArc === "strained") {
    response = `Let us stabilize this together. ${response}`;
  }
  if (context.socialProfile?.relationshipArc === "repairing") {
    response = `We are back on track. ${response}`;
  }
  if (context.socialProfile?.relationshipArc === "reliant") {
    response = `Continuing from our long-term workflow. ${response}`;
  }
  if (context.socialProfile?.inferredTone === "friendly" && interactions > 1) {
    response = `Good to hear from you again. ${response}`;
  }
  if (context.personality.signals.warmth >= 7) {
    response = `Happy to help. ${response}`;
  }
  if (context.dialogPlan?.followUpQuestion) {
    response = `${response} ${context.dialogPlan.followUpQuestion}`.trim();
  }
  if (context.dialogPlan?.nextStep && !response.includes("Next:")) {
    response = `${response} Next: ${context.dialogPlan.nextStep}.`;
  }
  if ((context.dialogPlan?.pendingObjectives || 0) > 0 && !response.includes("Queue:")) {
    response = `${response} Queue: ${context.dialogPlan?.pendingObjectives} pending objective(s).`;
  }
  if (context.dialogPlan?.progressLabel && !response.includes("Progress:")) {
    response = `Progress: ${context.dialogPlan.progressLabel}. ${response}`;
  }
  const verbosity = context.socialProfile?.preferences?.verbosity || "balanced";
  if (verbosity === "brief" && response.length > 180) {
    response = `${response.slice(0, 177).trimEnd()}...`;
  }
  if (verbosity === "detailed" && !response.includes("Next:")) {
    response = `${response} Next: confirm your preferred target and constraints.`;
  }
  return response;
}

async function tryOpenAIReply(
  context: ChannelReplyContext,
  model: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "Rewrite assistant replies for conversational quality. Keep intent identical. Max 240 chars. No markdown.",
        },
        {
          role: "user",
          content: [
            `Channel: ${context.channel}`,
            `Route: ${context.routeName}`,
            `Inbound: ${context.inboundText}`,
            `BaseReply: ${context.baseReply}`,
            `ToneHint: ${context.socialProfile?.inferredTone || "direct"}`,
            `Relationship: ${context.socialProfile?.relationshipStage || "new"} (trust=${context.socialProfile?.trustScore ?? 50})`,
            `RelationshipArc: ${context.socialProfile?.relationshipArc || "onboarding"}`,
            `Preferences: verbosity=${context.socialProfile?.preferences?.verbosity || "balanced"}, pace=${context.socialProfile?.preferences?.pace || "normal"}`,
            `RecentHistory: ${(context.recentHistory || []).slice(-4).join(" | ") || "none"}`,
            `DialogIntent: ${context.dialogPlan?.session.lastIntent || "general"}`,
            `ObjectiveSummary: ${context.dialogPlan?.objectiveSummary || "none"}`,
            `ActiveObjective: ${context.dialogPlan?.activeObjective || "none"}`,
            `Progress: ${context.dialogPlan?.progressLabel || "scoping"}`,
            `NextStep: ${context.dialogPlan?.nextStep || "none"}`,
            `PendingObjectives: ${context.dialogPlan?.pendingObjectives ?? 0}`,
            `CompletedObjectives: ${context.dialogPlan?.completedObjectives ?? 0}`,
            `FollowUpQuestion: ${context.dialogPlan?.followUpQuestion || "none"}`,
          ].join("\n"),
        },
      ],
      temperature: 0.4,
    }),
  });
  if (!response.ok) return null;
  const payload: any = await response.json().catch(() => ({}));
  const text = String(payload?.choices?.[0]?.message?.content || "").trim();
  return text || null;
}

async function tryAnthropicReply(
  context: ChannelReplyContext,
  model: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 120,
      temperature: 0.3,
      system: "Rewrite assistant replies for conversational quality. Keep intent identical. Max 240 chars. No markdown.",
      messages: [
        {
          role: "user",
          content: [
            `Channel: ${context.channel}`,
            `Route: ${context.routeName}`,
            `Inbound: ${context.inboundText}`,
            `BaseReply: ${context.baseReply}`,
            `ToneHint: ${context.socialProfile?.inferredTone || "direct"}`,
            `Relationship: ${context.socialProfile?.relationshipStage || "new"} (trust=${context.socialProfile?.trustScore ?? 50})`,
            `RelationshipArc: ${context.socialProfile?.relationshipArc || "onboarding"}`,
            `Preferences: verbosity=${context.socialProfile?.preferences?.verbosity || "balanced"}, pace=${context.socialProfile?.preferences?.pace || "normal"}`,
            `RecentHistory: ${(context.recentHistory || []).slice(-4).join(" | ") || "none"}`,
            `DialogIntent: ${context.dialogPlan?.session.lastIntent || "general"}`,
            `ObjectiveSummary: ${context.dialogPlan?.objectiveSummary || "none"}`,
            `ActiveObjective: ${context.dialogPlan?.activeObjective || "none"}`,
            `Progress: ${context.dialogPlan?.progressLabel || "scoping"}`,
            `NextStep: ${context.dialogPlan?.nextStep || "none"}`,
            `PendingObjectives: ${context.dialogPlan?.pendingObjectives ?? 0}`,
            `CompletedObjectives: ${context.dialogPlan?.completedObjectives ?? 0}`,
            `FollowUpQuestion: ${context.dialogPlan?.followUpQuestion || "none"}`,
          ].join("\n"),
        },
      ],
    }),
  });
  if (!response.ok) return null;
  const payload: any = await response.json().catch(() => ({}));
  const text = String(payload?.content?.[0]?.text || "").trim();
  return text || null;
}

export async function generateQualityReply(
  rootDir: string,
  context: ChannelReplyContext,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<{ text: string; mode: "fallback" | "openai" | "anthropic" }> {
  const fetchImpl = options.fetchImpl || fetch;
  const config = await loadConfig(rootDir);
  const provider = config.provider.trim().toLowerCase();
  const model = config.model || (provider === "anthropic" ? "claude-3-5-sonnet-20241022" : "gpt-4o-mini");

  if (provider === "openai") {
    const text = await tryOpenAIReply(context, model, fetchImpl).catch(() => null);
    if (text) return { text, mode: "openai" };
  }
  if (provider === "anthropic") {
    const text = await tryAnthropicReply(context, model, fetchImpl).catch(() => null);
    if (text) return { text, mode: "anthropic" };
  }

  return { text: fallbackQualityReply(context), mode: "fallback" };
}
