import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { SupportedChannel } from "./channels.js";

const SOCIAL_MEMORY_FILE = "brain/social_memory.json";

export interface SocialUserProfile {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  channels: SupportedChannel[];
  interactions: number;
  inferredTone: "friendly" | "direct" | "urgent";
  trustScore: number;
  relationshipStage: "new" | "familiar" | "trusted";
  relationshipArc: "onboarding" | "building" | "collaborating" | "reliant" | "strained" | "repairing";
  positiveSignals: number;
  negativeSignals: number;
  consecutivePositive: number;
  consecutiveNegative: number;
  preferences: {
    verbosity: "brief" | "balanced" | "detailed";
    pace: "normal" | "fast";
  };
  arcMilestones: Array<{ at: string; arc: string; reason: string }>;
  notes: string[];
}

export interface SocialMemoryState {
  version: 1;
  users: Record<string, SocialUserProfile>;
}

function socialMemoryPath(rootDir: string): string {
  return path.join(rootDir, SOCIAL_MEMORY_FILE);
}

function inferTone(text: string): "friendly" | "direct" | "urgent" {
  const lower = text.toLowerCase();
  if (/\burgent\b|\basap\b|\bnow\b/.test(lower)) return "urgent";
  if (/\bplease\b|\bthanks\b|\bthank you\b/.test(lower)) return "friendly";
  return "direct";
}

function sentimentSignal(text: string): number {
  const lower = text.toLowerCase();
  if (/\bthanks\b|\bthank you\b|\bgreat\b|\bawesome\b|\blove\b/.test(lower)) return 1;
  if (/\bwrong\b|\bbad\b|\bbroken\b|\bangry\b|\bfrustrat/.test(lower)) return -1;
  return 0;
}

function relationshipStageFor(interactions: number, trustScore: number): "new" | "familiar" | "trusted" {
  if (interactions >= 8 || trustScore >= 70) return "trusted";
  if (interactions >= 3 || trustScore >= 55) return "familiar";
  return "new";
}

function relationshipArcFor(profile: {
  interactions: number;
  trustScore: number;
  consecutivePositive: number;
  consecutiveNegative: number;
  previousArc?: SocialUserProfile["relationshipArc"];
}): SocialUserProfile["relationshipArc"] {
  if (profile.consecutiveNegative >= 3) return "strained";
  if (profile.previousArc === "strained" && profile.consecutivePositive >= 2) return "repairing";
  if (profile.interactions >= 20 && profile.trustScore >= 75) return "reliant";
  if (profile.interactions >= 10 && profile.trustScore >= 65) return "collaborating";
  if (profile.interactions >= 4 && profile.trustScore >= 55) return "building";
  return "onboarding";
}

function inferPreferences(
  text: string,
  current: { verbosity: "brief" | "balanced" | "detailed"; pace: "normal" | "fast" } | undefined,
): { verbosity: "brief" | "balanced" | "detailed"; pace: "normal" | "fast" } {
  const lower = text.toLowerCase();
  let verbosity = current?.verbosity || "balanced";
  let pace = current?.pace || "normal";
  if (/\bshort\b|\bbrief\b|\btldr\b|\bconcise\b/.test(lower)) verbosity = "brief";
  if (/\bdetailed\b|\bdeep\b|\bthorough\b/.test(lower)) verbosity = "detailed";
  if (/\bquick\b|\bfast\b|\basap\b/.test(lower)) pace = "fast";
  return { verbosity, pace };
}

export async function loadSocialMemory(rootDir: string): Promise<SocialMemoryState> {
  const target = socialMemoryPath(rootDir);
  if (!existsSync(target)) return { version: 1, users: {} };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as SocialMemoryState;
    if (!parsed || parsed.version !== 1 || typeof parsed.users !== "object") {
      return { version: 1, users: {} };
    }
    return parsed;
  } catch {
    return { version: 1, users: {} };
  }
}

export async function summarizeTrust(rootDir: string): Promise<{
  average: number;
  count: number;
  min: number;
  max: number;
}> {
  const state = await loadSocialMemory(rootDir);
  const profiles = Object.values(state.users || {});
  if (profiles.length === 0) {
    return { average: 50, count: 0, min: 50, max: 50 };
  }
  const scores = profiles.map((profile) => Number(profile.trustScore || 50));
  const total = scores.reduce((sum, score) => sum + score, 0);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return {
    average: Number((total / scores.length).toFixed(1)),
    count: scores.length,
    min,
    max,
  };
}

async function saveSocialMemory(rootDir: string, state: SocialMemoryState): Promise<void> {
  const target = socialMemoryPath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

export async function updateSocialMemory(
  rootDir: string,
  channel: SupportedChannel,
  senderId: string,
  text: string,
): Promise<SocialUserProfile> {
  const state = await loadSocialMemory(rootDir);
  const key = `${channel}:${senderId}`.toLowerCase();
  const now = new Date().toISOString();
  const tone = inferTone(text);
  const sentiment = sentimentSignal(text);
  const existing = state.users[key];
  const nextPositive = sentiment > 0 ? Number(existing?.consecutivePositive || 0) + 1 : 0;
  const nextNegative = sentiment < 0 ? Number(existing?.consecutiveNegative || 0) + 1 : 0;
  const next: SocialUserProfile = existing
    ? {
        ...existing,
        lastSeenAt: now,
        channels: Array.from(new Set([...(existing.channels || []), channel])) as SupportedChannel[],
        interactions: Number(existing.interactions || 0) + 1,
        inferredTone: tone,
        trustScore: Math.max(0, Math.min(100, Number(existing.trustScore || 50) + sentiment * 4 + 1)),
        positiveSignals: Number(existing.positiveSignals || 0) + (sentiment > 0 ? 1 : 0),
        negativeSignals: Number(existing.negativeSignals || 0) + (sentiment < 0 ? 1 : 0),
        consecutivePositive: nextPositive,
        consecutiveNegative: nextNegative,
        preferences: inferPreferences(text, existing.preferences),
      }
    : {
        id: key,
        firstSeenAt: now,
        lastSeenAt: now,
        channels: [channel],
        interactions: 1,
        inferredTone: tone,
        trustScore: Math.max(0, Math.min(100, 50 + sentiment * 4)),
        relationshipStage: "new",
        relationshipArc: "onboarding",
        positiveSignals: sentiment > 0 ? 1 : 0,
        negativeSignals: sentiment < 0 ? 1 : 0,
        consecutivePositive: nextPositive,
        consecutiveNegative: nextNegative,
        preferences: inferPreferences(text, undefined),
        arcMilestones: [],
        notes: [],
      };

  next.relationshipStage = relationshipStageFor(next.interactions, next.trustScore);
  const newArc = relationshipArcFor({
    interactions: next.interactions,
    trustScore: next.trustScore,
    consecutivePositive: next.consecutivePositive,
    consecutiveNegative: next.consecutiveNegative,
    previousArc: next.relationshipArc,
  });
  if (newArc !== next.relationshipArc) {
    next.arcMilestones = [
      ...(next.arcMilestones || []),
      {
        at: now,
        arc: newArc,
        reason: `signals(+${next.consecutivePositive}/-${next.consecutiveNegative}) trust=${next.trustScore}`,
      },
    ].slice(-25);
    next.relationshipArc = newArc;
  }

  if (text.length <= 120 && /prefer|like|don't like|do not like|always|never/i.test(text)) {
    const trimmed = text.trim();
    next.notes = [...(next.notes || []), trimmed].slice(-20);
  }

  state.users[key] = next;
  await saveSocialMemory(rootDir, state);
  return next;
}
