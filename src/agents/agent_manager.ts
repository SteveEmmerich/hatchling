import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";
import {
  type AgentTask,
  type AgentResult,
  type AgentHistoryEntry,
  type AgentTaskInput,
  createAgentTask,
} from "./agent_types.js";
import { executeAgentTask } from "./agent_runner.js";

const ACTIVE_FILE = "brain/agents/active_agents.json";
const RESULTS_FILE = "brain/agents/agent_results.json";
const HISTORY_FILE = "brain/agents/agent_history.json";

type AgentFiles = {
  active: AgentTask[];
  results: AgentResult[];
  history: AgentHistoryEntry[];
};

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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

async function writeJson(rootDir: string, relativePath: string, payload: unknown): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(relativePath, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(payload, null, 2), "utf-8");
}

function sanitizeState(input: AgentFiles): AgentFiles {
  return {
    active: sanitizeArray<AgentTask>(input.active),
    results: sanitizeArray<AgentResult>(input.results),
    history: sanitizeArray<AgentHistoryEntry>(input.history),
  };
}

export async function ensureAgentState(rootDir: string): Promise<AgentFiles> {
  const activeRaw = await readJsonOrDefault(rootDir, ACTIVE_FILE, { agents: [] });
  const resultsRaw = await readJsonOrDefault(rootDir, RESULTS_FILE, { results: [] });
  const historyRaw = await readJsonOrDefault(rootDir, HISTORY_FILE, { agents: [] });

  const state = sanitizeState({
    active: sanitizeArray<AgentTask>((activeRaw as { agents?: unknown }).agents),
    results: sanitizeArray<AgentResult>((resultsRaw as { results?: unknown }).results),
    history: sanitizeArray<AgentHistoryEntry>((historyRaw as { agents?: unknown }).agents),
  });

  await writeJson(rootDir, ACTIVE_FILE, { agents: state.active });
  await writeJson(rootDir, RESULTS_FILE, { results: state.results });
  await writeJson(rootDir, HISTORY_FILE, { agents: state.history });

  return state;
}

export async function spawnAgent(rootDir: string, input: AgentTaskInput): Promise<AgentTask> {
  await ensureAgentState(rootDir);
  const task = createAgentTask(input);
  const activePayload = await readJsonOrDefault<{ agents: AgentTask[] }>(rootDir, ACTIVE_FILE, { agents: [] });
  const agents = sanitizeArray<AgentTask>(activePayload.agents);
  agents.push(task);
  await writeJson(rootDir, ACTIVE_FILE, { agents });
  return task;
}

export async function listActiveAgents(rootDir: string): Promise<AgentTask[]> {
  const state = await ensureAgentState(rootDir);
  return state.active;
}

export async function collectAgentResults(rootDir: string): Promise<AgentResult[]> {
  const state = await ensureAgentState(rootDir);
  return state.results;
}

export async function terminateAgent(rootDir: string, id: string, reason?: string): Promise<boolean> {
  const state = await ensureAgentState(rootDir);
  const index = state.active.findIndex((agent) => agent.id === id);
  if (index === -1) return false;
  const [agent] = state.active.splice(index, 1);
  const finishedAt = nowIso();
  const terminated: AgentHistoryEntry = {
    id: agent.id,
    type: agent.type,
    goal: agent.goal,
    createdAt: agent.createdAt,
    status: "terminated",
    startedAt: agent.startedAt,
    finishedAt,
    error: reason || agent.error,
    parent: agent.parent,
  };
  await writeJson(rootDir, ACTIVE_FILE, { agents: state.active });
  state.history.push(terminated);
  await writeJson(rootDir, HISTORY_FILE, { agents: state.history });
  return true;
}

export async function runAgent(rootDir: string, id: string): Promise<AgentResult | undefined> {
  const state = await ensureAgentState(rootDir);
  const agent = state.active.find((entry) => entry.id === id);
  if (!agent) return undefined;
  return executeAgentTask(rootDir, agent);
}
