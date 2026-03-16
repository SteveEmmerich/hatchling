import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { loadOrganismState } from "../organism/state_manager.js";
import { getRecentSpawnLog } from "../agents/agent_manager.js";
import { mapResultToTask } from "../agents/agent_followup.js";
import { loadMutationSuggestionStore } from "../mutation/mutation_suggestions.js";
import { loadBehaviorContext, formatInteractionPosture } from "../organism/behavior_context.js";

interface EpisodeEntry {
  timestamp: string;
  event: string;
  outcome?: string;
  context?: Record<string, unknown>;
}

interface ReflectionSignalEntry {
  timestamp: string;
  confidenceDelta: number;
  curiosityDelta: number;
  trustDelta: number;
  source?: string;
}

interface MutationSuggestionEntry {
  summary: string;
  confidence: number;
  status: string;
  sourceEvent?: string;
  sourceReflection?: string;
  reason?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewReason?: string;
}

interface CuriosityAdjustment {
  timestamp: string;
  reason: string;
  delta: number;
}

interface AgentResultEntry {
  id: string;
  agentId: string;
  agentType: string;
  status: string;
  output: string;
  result?: {
    summary: string;
    findings: Array<{ label: string; detail: string; severity?: "low" | "medium" | "high" }>;
    confidence: number;
  };
  finishedAt: string;
}

export interface ReflectionStatusSnapshot {
  recentEpisodes: EpisodeEntry[];
  recentNarrative: string[];
  adjustments: {
    totals: { confidenceDelta: number; curiosityDelta: number; trustDelta: number };
    recent: ReflectionSignalEntry[];
  };
  mutationSuggestions: {
    pending: number;
    approved: number;
    rejected: number;
    recent: MutationSuggestionEntry[];
  };
  curiosityTasks: EpisodeEntry[];
  agentFollowUps: Array<{ finishedAt: string; agentType: string; taskType: string; goal: string; status: string }>;
  patterns: Array<{ event: string; count: number }>;
  curiosityAdjustments: CuriosityAdjustment[];
  agentSpawns: Array<{ createdAt: string; agentType: string; goal: string; reason: string }>;
  postureSummary: string;
}

const EPISODIC_FILE = "brain/memory/episodic_memory.json";
const NARRATIVE_FILE = "brain/memory/narrative.md";
const REFLECTION_SIGNALS_FILE = "brain/reflection_signals.json";
const CURIOSITY_STATE_FILE = "brain/curiosity_state.json";
const AGENT_RESULTS_FILE = "brain/agents/agent_results.json";

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

function normalizeEpisode(entry: any): EpisodeEntry | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const event = String(entry.event || "").trim();
  const timestamp = String(entry.timestamp || "").trim();
  if (!event || !timestamp) return undefined;
  const outcome = entry.outcome ? String(entry.outcome) : undefined;
  const context = entry.context && typeof entry.context === "object" ? (entry.context as Record<string, unknown>) : undefined;
  return { event, timestamp, outcome, context };
}

async function loadEpisodes(rootDir: string): Promise<EpisodeEntry[]> {
  const payload = await readJsonOrDefault<{ episodes?: unknown }>(rootDir, EPISODIC_FILE, { episodes: [] });
  const raw = Array.isArray(payload.episodes) ? payload.episodes : [];
  return raw.map(normalizeEpisode).filter(Boolean) as EpisodeEntry[];
}

async function loadNarrativeLines(rootDir: string, limit = 3): Promise<string[]> {
  const target = path.join(rootDir, NARRATIVE_FILE);
  if (!existsSync(target)) return [];
  try {
    const content = await fs.readFile(target, "utf-8");
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
    return lines.slice(-limit);
  } catch {
    return [];
  }
}

async function loadReflectionSignals(rootDir: string): Promise<ReflectionSignalEntry[]> {
  const payload = await readJsonOrDefault<{ signals?: unknown }>(rootDir, REFLECTION_SIGNALS_FILE, { signals: [] });
  const raw = Array.isArray(payload.signals) ? payload.signals : [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return undefined;
      const record = entry as Record<string, unknown>;
      const timestamp = typeof record.timestamp === "string" ? record.timestamp : "";
      if (!timestamp) return undefined;
      return {
        timestamp,
        confidenceDelta: Number(record.confidenceDelta || 0),
        curiosityDelta: Number(record.curiosityDelta || 0),
        trustDelta: Number(record.trustDelta || 0),
        source: typeof record.source === "string" ? record.source : undefined,
      };
    })
    .filter(Boolean) as ReflectionSignalEntry[];
}

async function loadMutationSuggestions(rootDir: string): Promise<MutationSuggestionEntry[]> {
  const store = await loadMutationSuggestionStore(rootDir);
  return store.suggestions.map((entry) => ({
    summary: entry.summary,
    confidence: clamp(Number(entry.confidence || 0), 0, 1),
    status: entry.status,
    sourceEvent: entry.sourceEvent,
    sourceReflection: entry.sourceReflection,
    reason: entry.reason,
    createdAt: entry.createdAt,
    reviewedAt: entry.reviewedAt,
    reviewReason: entry.reviewReason,
  }));
}

async function loadCuriosityAdjustments(rootDir: string): Promise<CuriosityAdjustment[]> {
  const payload = await readJsonOrDefault<{ adjustments?: unknown }>(rootDir, CURIOSITY_STATE_FILE, { adjustments: [] });
  const raw = Array.isArray(payload.adjustments) ? payload.adjustments : [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return undefined;
      const record = entry as Record<string, unknown>;
      const timestamp = typeof record.timestamp === "string" ? record.timestamp : "";
      const reason = typeof record.reason === "string" ? record.reason : "";
      if (!timestamp || !reason) return undefined;
      return {
        timestamp,
        reason,
        delta: Number(record.delta || 0),
      };
    })
    .filter(Boolean) as CuriosityAdjustment[];
}

function normalizeAgentResult(entry: any): AgentResultEntry | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const record = entry as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const agentId = typeof record.agentId === "string" ? record.agentId : "";
  const agentType = typeof record.agentType === "string" ? record.agentType : "";
  const status = typeof record.status === "string" ? record.status : "";
  const output = typeof record.output === "string" ? record.output : "";
  const finishedAt = typeof record.finishedAt === "string" ? record.finishedAt : "";
  if (!id || !agentId || !agentType || !status || !finishedAt) return undefined;
  let result: AgentResultEntry["result"];
  if (record.result && typeof record.result === "object") {
    const structured = record.result as Record<string, unknown>;
    const summary = typeof structured.summary === "string" ? structured.summary : "";
    const findingsRaw = Array.isArray(structured.findings) ? structured.findings : [];
    const findings = findingsRaw
      .map((finding) => {
        if (!finding || typeof finding !== "object") return undefined;
        const entry = finding as Record<string, unknown>;
        const label = typeof entry.label === "string" ? entry.label : "";
        const detail = typeof entry.detail === "string" ? entry.detail : "";
        if (!label || !detail) return undefined;
        const severityRaw = typeof entry.severity === "string" ? entry.severity : "";
        const severity =
          severityRaw === "low" || severityRaw === "medium" || severityRaw === "high"
            ? severityRaw
            : undefined;
        return { label, detail, severity };
      })
      .filter(Boolean) as Array<{ label: string; detail: string; severity?: "low" | "medium" | "high" }>;
    const confidence = clamp(Number(structured.confidence ?? 0.5), 0, 1);
    result = { summary: summary || output.split("\n").find(Boolean) || "Agent result", findings, confidence };
  }
  return { id, agentId, agentType, status, output, result, finishedAt };
}

async function loadAgentResults(rootDir: string): Promise<AgentResultEntry[]> {
  const payload = await readJsonOrDefault<{ results?: unknown }>(rootDir, AGENT_RESULTS_FILE, { results: [] });
  const raw = Array.isArray(payload.results) ? payload.results : [];
  return raw.map(normalizeAgentResult).filter(Boolean) as AgentResultEntry[];
}

function buildPatterns(episodes: EpisodeEntry[], limit = 3): Array<{ event: string; count: number }> {
  const counts = new Map<string, number>();
  for (const episode of episodes) {
    const event = episode.event;
    counts.set(event, (counts.get(event) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([event, count]) => ({ event, count }));
}

function filterCuriosityEpisodes(episodes: EpisodeEntry[], limit = 3): EpisodeEntry[] {
  const matches = episodes.filter((episode) => {
    const taskType = episode.context?.taskType;
    if (typeof taskType === "string" && taskType.includes("curiosity")) return true;
    if (episode.event.toLowerCase().includes("curiosity")) return true;
    return false;
  });
  return matches.slice(-limit);
}

function filterAgentFollowups(results: AgentResultEntry[], limit = 3): Array<{ finishedAt: string; agentType: string; taskType: string; goal: string; status: string }> {
  const completed = results
    .filter((result) => result.status === "completed")
    .slice(-limit);
  return completed.map((result) => {
    const task = mapResultToTask({
      id: result.id,
      agentId: result.agentId,
      agentType: result.agentType as any,
      status: result.status as any,
      output: result.output,
      result: result.result,
      createdAt: result.finishedAt,
      finishedAt: result.finishedAt,
    });
    return {
      finishedAt: result.finishedAt,
      agentType: result.agentType,
      taskType: task.type,
      goal: task.goal,
      status: result.status,
    };
  });
}

function summarizeAdjustments(entries: ReflectionSignalEntry[], limit = 5): ReflectionStatusSnapshot["adjustments"] {
  const recent = entries.slice(-limit);
  const totals = recent.reduce(
    (acc, entry) => {
      acc.confidenceDelta += entry.confidenceDelta;
      acc.curiosityDelta += entry.curiosityDelta;
      acc.trustDelta += entry.trustDelta;
      return acc;
    },
    { confidenceDelta: 0, curiosityDelta: 0, trustDelta: 0 },
  );
  return {
    totals: {
      confidenceDelta: Number(totals.confidenceDelta.toFixed(2)),
      curiosityDelta: Number(totals.curiosityDelta.toFixed(2)),
      trustDelta: Number(totals.trustDelta.toFixed(2)),
    },
    recent,
  };
}

function summarizeMutations(entries: MutationSuggestionEntry[], limit = 5): ReflectionStatusSnapshot["mutationSuggestions"] {
  const recent = entries.slice(-limit);
  return {
    pending: entries.filter((entry) => entry.status === "pending").length,
    approved: entries.filter((entry) => entry.status === "approved_for_pipeline").length,
    rejected: entries.filter((entry) => entry.status === "rejected_for_now").length,
    recent,
  };
}

export async function getReflectionStatus(rootDir: string): Promise<ReflectionStatusSnapshot> {
  const episodes = await loadEpisodes(rootDir);
  const narrative = await loadNarrativeLines(rootDir, 3);
  const signals = await loadReflectionSignals(rootDir);
  const mutations = await loadMutationSuggestions(rootDir);
  const curiosityAdjustments = await loadCuriosityAdjustments(rootDir);
  const agentResults = await loadAgentResults(rootDir);
  const organism = await loadOrganismState(rootDir);
  const spawnLog = await getRecentSpawnLog(rootDir, 5);
  const behavior = await loadBehaviorContext(rootDir);

  const recentEpisodes = episodes.slice(-5);
  const curiosityTasks = filterCuriosityEpisodes(episodes.slice(-30));
  const agentFollowUps = filterAgentFollowups(agentResults);
  const patterns = buildPatterns(episodes.slice(-40));
  const adjustments = summarizeAdjustments(signals);
  const mutationSuggestions = summarizeMutations(mutations);

  if (organism.selectedTask?.type === "curiosity_task" && curiosityTasks.length === 0) {
    curiosityTasks.push({
      timestamp: organism.selectedTask.selectedAt,
      event: `task: ${organism.selectedTask.goal}`,
      outcome: undefined,
      context: { taskType: organism.selectedTask.type },
    });
  }

  return {
    recentEpisodes,
    recentNarrative: narrative,
    adjustments,
    mutationSuggestions,
    curiosityTasks,
    agentFollowUps,
    patterns,
    curiosityAdjustments: curiosityAdjustments.slice(-5),
    agentSpawns: spawnLog.map((entry) => ({
      createdAt: entry.createdAt,
      agentType: entry.agentType,
      goal: entry.goal,
      reason: entry.reason,
    })),
    postureSummary: formatInteractionPosture(behavior.interactionStyle, behavior.decisionPosture),
  };
}

function formatDelta(value: number): string {
  const rounded = Number(value.toFixed(2));
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

export function formatReflectionStatus(status: ReflectionStatusSnapshot): string {
  const lines: string[] = [];
  lines.push("Reflection Tuning");
  lines.push(`Recent episodes: ${status.recentEpisodes.length}`);
  for (const episode of status.recentEpisodes) {
    const summary = episode.outcome ? ` — ${episode.outcome}` : "";
    lines.push(`- ${episode.timestamp} · ${episode.event}${summary}`);
  }
  lines.push(`Recent narrative: ${status.recentNarrative.length}`);
  for (const entry of status.recentNarrative) {
    lines.push(`- ${entry}`);
  }
  lines.push(
    `Adjustments (last ${status.adjustments.recent.length}): confidence=${formatDelta(status.adjustments.totals.confidenceDelta)} curiosity=${formatDelta(status.adjustments.totals.curiosityDelta)} trust=${formatDelta(status.adjustments.totals.trustDelta)}`,
  );
  for (const entry of status.adjustments.recent) {
    lines.push(
      `- ${entry.timestamp} · conf=${formatDelta(entry.confidenceDelta)} cur=${formatDelta(entry.curiosityDelta)} trust=${formatDelta(entry.trustDelta)}${entry.source ? ` · source=${entry.source}` : ""}`,
    );
  }
  lines.push(
    `Mutation suggestions: pending=${status.mutationSuggestions.pending} approved=${status.mutationSuggestions.approved} rejected=${status.mutationSuggestions.rejected}`,
  );
  for (const entry of status.mutationSuggestions.recent) {
    lines.push(
      `- ${entry.createdAt} · ${entry.status} · ${entry.summary} (conf=${entry.confidence.toFixed(2)})${entry.sourceEvent ? ` · source=${entry.sourceEvent}` : ""}${entry.reason ? ` · reason=${entry.reason}` : ""}${entry.reviewReason ? ` · review=${entry.reviewReason}` : ""}`,
    );
  }
  lines.push(`Curiosity tasks (recent): ${status.curiosityTasks.length}`);
  for (const entry of status.curiosityTasks) {
    lines.push(`- ${entry.timestamp} · ${entry.event}`);
  }
  lines.push(`Agent follow-ups (recent): ${status.agentFollowUps.length}`);
  for (const entry of status.agentFollowUps) {
    lines.push(`- ${entry.finishedAt} · ${entry.agentType} -> ${entry.taskType}: ${entry.goal}`);
  }
  lines.push(`Agent spawns (recent): ${status.agentSpawns.length}`);
  for (const entry of status.agentSpawns) {
    lines.push(`- ${entry.createdAt} · ${entry.agentType} · ${entry.goal} · reason=${entry.reason}`);
  }
  lines.push(`Posture: ${status.postureSummary}`);
  lines.push(`Curiosity adjustments (recent): ${status.curiosityAdjustments.length}`);
  for (const entry of status.curiosityAdjustments) {
    lines.push(`- ${entry.timestamp} · ${entry.reason} (${formatDelta(entry.delta)})`);
  }
  lines.push(`Top patterns: ${status.patterns.length}`);
  for (const entry of status.patterns) {
    lines.push(`- ${entry.event} x${entry.count}`);
  }
  return lines.join("\n");
}
