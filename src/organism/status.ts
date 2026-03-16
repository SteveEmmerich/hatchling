import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { getEnergyState } from "./energy_system.js";
import { loadOrganismState } from "./state_manager.js";
import { loadCuriosityState } from "../curiosity/curiosity_engine.js";
import { loadBehaviorContext } from "./behavior_context.js";
import { PathGuard } from "../system/pathGuard.js";
import { loadSocialMemory } from "../memory/social_memory.js";
import { getRecentSpawnLog } from "../agents/agent_manager.js";
import { summarizeMutationSuggestions } from "../mutation/mutation_suggestions.js";

interface StatusSnapshot {
  energy: { level: number; max: number; lowEnergy: boolean };
  cycle: { sleepCycles: number; lastSleepAt?: string };
  tasks: { lastSelected?: { id: string; type: string; goal: string; score?: number }; queueDepth: number };
  curiosity: { adjusted: number; baseline: number };
  confidence: number;
  trustAverage: number;
  reflection: { pendingSignals: number; lastNarrative?: string };
  mutations: { pendingSuggestions: number; approvedSuggestions: number; rejectedSuggestions: number };
  agents: { active: number };
  sleep: { lastLog?: string; commitHash?: string };
  agentSpawn?: { goal: string; reason: string; type: string; createdAt: string };
  selfModel: { name: string; purpose: string; strengths: string[]; weaknesses: string[]; strategy: string; tone: string };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

async function readJsonOrDefault<T>(rootDir: string, relativePath: string, fallback: T): Promise<T> {
  const target = path.join(rootDir, relativePath);
  if (!existsSync(target)) return fallback;
  try {
    return JSON.parse(await fs.readFile(target, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function loadCuriosityAdjusted(rootDir: string): Promise<number> {
  const state = await readJsonOrDefault<{ adjustedCuriosity?: number }>(
    rootDir,
    "brain/curiosity_state.json",
    { adjustedCuriosity: 5 },
  );
  return clamp(Number(state.adjustedCuriosity ?? 5), 1, 10);
}

async function loadTrustAverage(rootDir: string): Promise<number> {
  const social = await loadSocialMemory(rootDir);
  const users = Object.values(social.users || {});
  if (users.length === 0) return 50;
  const total = users.reduce((sum, user) => sum + Number(user.trust || 50), 0);
  return Number((total / users.length).toFixed(1));
}

async function loadReflectionSummary(rootDir: string): Promise<{ pendingSignals: number; lastNarrative?: string }> {
  const signals = await readJsonOrDefault<{ signals?: Array<{ consumed?: boolean }> }>(
    rootDir,
    "brain/reflection_signals.json",
    { signals: [] },
  );
  const pending = Array.isArray(signals.signals)
    ? signals.signals.filter((signal) => !signal.consumed).length
    : 0;
  const narrativePath = path.join(rootDir, "brain", "memory", "narrative.md");
  let lastNarrative = "";
  if (existsSync(narrativePath)) {
    try {
      const content = await fs.readFile(narrativePath, "utf-8");
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      lastNarrative = lines[lines.length - 1] || "";
    } catch {
      lastNarrative = "";
    }
  }
  return { pendingSignals: pending, lastNarrative: lastNarrative || undefined };
}

async function loadMutationSummary(rootDir: string): Promise<{ pending: number; approved: number; rejected: number }> {
  const summary = await summarizeMutationSuggestions(rootDir);
  return { pending: summary.pending, approved: summary.approved, rejected: summary.rejected };
}

async function loadAgentCount(rootDir: string): Promise<number> {
  const payload = await readJsonOrDefault<{ agents?: unknown[] }>(
    rootDir,
    "brain/agents/active_agents.json",
    { agents: [] },
  );
  return Array.isArray(payload.agents) ? payload.agents.length : 0;
}

async function loadSleepSummary(rootDir: string): Promise<{ lastLog?: string; commitHash?: string }> {
  const sleepDir = path.join(rootDir, "memory", "sleep_logs");
  if (!existsSync(sleepDir)) return {};
  try {
    const files = (await fs.readdir(sleepDir))
      .filter((file) => file.endsWith(".json"))
      .sort();
    const latest = files[files.length - 1];
    if (!latest) return {};
    const payload = JSON.parse(await fs.readFile(path.join(sleepDir, latest), "utf-8")) as { commitHash?: string; date?: string };
    return { lastLog: payload.date || latest.replace(".json", ""), commitHash: payload.commitHash };
  } catch {
    return {};
  }
}

async function loadCycleSummary(rootDir: string): Promise<{ sleepCycles: number }> {
  const evo = await readJsonOrDefault<{ sleepCycles?: number }>(rootDir, "brain/EVOLUTION_LOG.json", { sleepCycles: 0 });
  return { sleepCycles: Number(evo.sleepCycles || 0) };
}

export async function getOrganismStatus(rootDir: string): Promise<StatusSnapshot> {
  PathGuard.setRoot(rootDir);
  const energy = await getEnergyState(rootDir);
  const organism = await loadOrganismState(rootDir);
  const curiosity = await loadCuriosityState(rootDir);
  const curiosityAdjusted = await loadCuriosityAdjusted(rootDir);
  const behavior = await loadBehaviorContext(rootDir);
  const trustAverage = await loadTrustAverage(rootDir);
  const reflection = await loadReflectionSummary(rootDir);
  const mutationSummary = await loadMutationSummary(rootDir);
  const activeAgents = await loadAgentCount(rootDir);
  const sleep = await loadSleepSummary(rootDir);
  const cycle = await loadCycleSummary(rootDir);
  const spawnLog = await getRecentSpawnLog(rootDir, 1);
  const lastSpawn = spawnLog[0];

  return {
    energy: { level: energy.level, max: 100, lowEnergy: energy.lowEnergy },
    cycle: { sleepCycles: cycle.sleepCycles, lastSleepAt: sleep.lastLog },
    tasks: {
      lastSelected: organism.selectedTask
        ? {
            id: organism.selectedTask.id,
            type: organism.selectedTask.type,
            goal: organism.selectedTask.goal,
            score: organism.selectedTask.score,
          }
        : undefined,
      queueDepth: organism.tasks.queueDepth,
    },
    curiosity: { adjusted: curiosityAdjusted, baseline: clamp(Number(curiosity.curiosity ?? 5), 0, 10) },
    confidence: clamp(Number(behavior.traits.traits.confidence ?? 5), 0, 10),
    trustAverage,
    reflection,
    mutations: {
      pendingSuggestions: mutationSummary.pending,
      approvedSuggestions: mutationSummary.approved,
      rejectedSuggestions: mutationSummary.rejected,
    },
    agents: { active: activeAgents },
    sleep,
    agentSpawn: lastSpawn
      ? { goal: lastSpawn.goal, reason: lastSpawn.reason, type: lastSpawn.agentType, createdAt: lastSpawn.createdAt }
      : undefined,
    selfModel: {
      name: behavior.selfModel.identity.name,
      purpose: behavior.selfModel.identity.purpose,
      strengths: behavior.selfModel.strengths || [],
      weaknesses: behavior.selfModel.weaknesses || [],
      strategy: behavior.strategyPreference,
      tone: behavior.responseStyle.tone,
    },
  };
}

export function formatOrganismStatus(status: StatusSnapshot): string {
  const lines: string[] = [];
  lines.push("Hatchling Status");
  lines.push(`Energy: ${status.energy.level}/${status.energy.max} (low=${status.energy.lowEnergy})`);
  lines.push(`Cycle: sleepCycles=${status.cycle.sleepCycles}${status.cycle.lastSleepAt ? ` lastSleep=${status.cycle.lastSleepAt}` : ""}`);
  if (status.tasks.lastSelected) {
    lines.push(`Task: ${status.tasks.lastSelected.type} · ${status.tasks.lastSelected.goal} (score=${status.tasks.lastSelected.score ?? "n/a"})`);
  } else {
    lines.push("Task: none selected");
  }
  lines.push(`Queue depth: ${status.tasks.queueDepth}`);
  lines.push(`Curiosity: baseline=${status.curiosity.baseline} adjusted=${status.curiosity.adjusted}`);
  lines.push(`Confidence: ${status.confidence.toFixed(1)} · Trust avg: ${status.trustAverage.toFixed(1)}`);
  lines.push(`Reflection: pendingSignals=${status.reflection.pendingSignals}${status.reflection.lastNarrative ? ` · last=${status.reflection.lastNarrative}` : ""}`);
  lines.push(
    `Mutations: pending=${status.mutations.pendingSuggestions} approved=${status.mutations.approvedSuggestions} rejected=${status.mutations.rejectedSuggestions}`,
  );
  lines.push(`Agents: active=${status.agents.active}`);
  if (status.agentSpawn) {
    lines.push(`Last agent spawn: ${status.agentSpawn.type} · ${status.agentSpawn.goal} · reason=${status.agentSpawn.reason}`);
  }
  lines.push(`Sleep: last=${status.sleep.lastLog || "n/a"}${status.sleep.commitHash ? ` · commit=${status.sleep.commitHash}` : ""}`);
  lines.push(
    `Self-model: ${status.selfModel.name} · ${status.selfModel.purpose} · strengths=${status.selfModel.strengths.join(", ") || "n/a"} · strategy=${status.selfModel.strategy} · tone=${status.selfModel.tone}`,
  );
  return lines.join("\n");
}
