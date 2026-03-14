import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";
import { createMaintenanceTask, createTask, type Task } from "../tasks/task_types.js";
import type { AgentResult, AgentTask, AgentType } from "./agent_types.js";

const ACTIVE_FILE = "brain/agents/active_agents.json";
const RESULTS_FILE = "brain/agents/agent_results.json";

function nowIso(): string {
  return new Date().toISOString();
}

function ensureArray<T>(value: unknown): T[] {
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

function normalizeResult(entry: any): AgentResult | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const id = typeof entry.id === "string" ? entry.id : "";
  const agentId = typeof entry.agentId === "string" ? entry.agentId : "";
  const agentType = typeof entry.agentType === "string" ? entry.agentType : "";
  const status = typeof entry.status === "string" ? entry.status : "";
  const output = typeof entry.output === "string" ? entry.output : "";
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : "";
  const finishedAt = typeof entry.finishedAt === "string" ? entry.finishedAt : "";
  if (!id || !agentId || !agentType || !status || !createdAt || !finishedAt) return undefined;
  return {
    id,
    agentId,
    agentType: agentType as AgentType,
    status: status as AgentResult["status"],
    output,
    createdAt,
    finishedAt,
    consumedAt: typeof entry.consumedAt === "string" ? entry.consumedAt : undefined,
  };
}

function summarizeOutput(output: string): string {
  const line = output.split("\n").map((value) => value.trim()).find(Boolean);
  return line ? line.slice(0, 120) : "Agent result available.";
}

function mapResultToTask(result: AgentResult): Task {
  const summary = summarizeOutput(result.output);
  let task: Task;
  switch (result.agentType) {
    case "researcher":
    case "experimenter":
      task = createTask({
        id: `${result.id}-followup`,
        type: "curiosity_task",
        goal: `${result.agentType} result: ${summary}`,
        priority: 4,
        energyCost: 4,
        createdAt: result.finishedAt,
      });
      break;
    case "test_runner":
      task = createMaintenanceTask(`${result.agentType} result: ${summary}`, {
        id: `${result.id}-followup`,
        priority: 5,
        energyCost: 3,
        createdAt: result.finishedAt,
      });
      break;
    case "code_analyzer":
    case "doc_writer":
    default:
      task = createTask({
        id: `${result.id}-followup`,
        type: "project_task",
        goal: `${result.agentType} result: ${summary}`,
        priority: 5,
        energyCost: 5,
        createdAt: result.finishedAt,
      });
      break;
  }
  return task;
}

async function loadAgentResults(rootDir: string): Promise<AgentResult[]> {
  const payload = await readJsonOrDefault<{ results?: unknown }>(rootDir, RESULTS_FILE, { results: [] });
  const rawResults = ensureArray(payload.results);
  return rawResults.map(normalizeResult).filter(Boolean) as AgentResult[];
}

async function loadActiveAgents(rootDir: string): Promise<AgentTask[]> {
  const payload = await readJsonOrDefault<{ agents?: unknown }>(rootDir, ACTIVE_FILE, { agents: [] });
  return ensureArray(payload.agents) as AgentTask[];
}

async function markResultsConsumed(rootDir: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const payload = await readJsonOrDefault<{ results?: unknown }>(rootDir, RESULTS_FILE, { results: [] });
  const rawResults = ensureArray(payload.results);
  const updated = rawResults.map((entry: any) => {
    if (entry && ids.includes(String(entry.id)) && !entry.consumedAt) {
      return { ...entry, consumedAt: nowIso() };
    }
    return entry;
  });
  await writeJson(rootDir, RESULTS_FILE, { results: updated });
}

export async function collectAgentFollowUpTasks(rootDir: string): Promise<Task[]> {
  const results = await loadAgentResults(rootDir);
  const activeAgents = await loadActiveAgents(rootDir);
  const activeIds = new Set(activeAgents.map((agent) => agent.id));
  const completed = results.filter(
    (result) => result.status === "completed" && !result.consumedAt && !activeIds.has(result.agentId),
  );
  const tasks = completed.map(mapResultToTask);
  await markResultsConsumed(rootDir, completed.map((result) => result.id));
  return tasks;
}

export { mapResultToTask };
