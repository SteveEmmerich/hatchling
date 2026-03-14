import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";
import {
  type AgentTask,
  type AgentResult,
  type AgentHistoryEntry,
  type AgentStatus,
} from "./agent_types.js";
import { getAgentRunner, registerAgentRunner } from "./agent_registry.js";

const ACTIVE_FILE = "brain/agents/active_agents.json";
const RESULTS_FILE = "brain/agents/agent_results.json";
const HISTORY_FILE = "brain/agents/agent_history.json";

function nowIso(): string {
  return new Date().toISOString();
}

function ensureArray(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
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

function sanitizeTask(task: AgentTask, status: AgentStatus): AgentTask {
  return {
    ...task,
    status,
    allowed_tools: Array.isArray(task.allowed_tools)
      ? task.allowed_tools.map((tool) => String(tool)).filter(Boolean)
      : [],
  };
}

function makeHistoryEntry(task: AgentTask, status: AgentStatus, resultId?: string, error?: string): AgentHistoryEntry {
  return {
    id: task.id,
    type: task.type,
    goal: task.goal,
    createdAt: task.createdAt,
    status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    resultId,
    error,
    parent: task.parent,
  };
}

async function updateActiveAgents(rootDir: string, tasks: AgentTask[]): Promise<void> {
  await writeJson(rootDir, ACTIVE_FILE, { agents: tasks });
}

async function appendResult(rootDir: string, result: AgentResult): Promise<void> {
  const payload = await readJsonOrDefault<{ results: AgentResult[] }>(rootDir, RESULTS_FILE, { results: [] });
  payload.results = ensureArray(payload.results) as AgentResult[];
  payload.results.push(result);
  await writeJson(rootDir, RESULTS_FILE, payload);
}

async function appendHistory(rootDir: string, entry: AgentHistoryEntry): Promise<void> {
  const payload = await readJsonOrDefault<{ agents: AgentHistoryEntry[] }>(rootDir, HISTORY_FILE, { agents: [] });
  payload.agents = ensureArray(payload.agents) as AgentHistoryEntry[];
  payload.agents.push(entry);
  await writeJson(rootDir, HISTORY_FILE, payload);
}

function requireTool(task: AgentTask, tool: string): void {
  if (!task.allowed_tools.includes(tool)) {
    throw new Error(`Tool not allowed: ${tool}`);
  }
}

async function listFiles(rootDir: string, relative: string): Promise<string[]> {
  const fullPath = path.join(rootDir, relative);
  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    return entries.map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function countSourceFiles(rootDir: string, relative: string): Promise<number> {
  const fullPath = path.join(rootDir, relative);
  let count = 0;
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      count += await countSourceFiles(rootDir, path.join(relative, entry.name));
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      count += 1;
    }
  }
  return count;
}

async function runCodeAnalyzer(rootDir: string, task: AgentTask): Promise<string> {
  requireTool(task, "filesystem:read");
  const srcCount = await countSourceFiles(rootDir, "src");
  const testCount = await countSourceFiles(rootDir, "tests");
  const topDirs = await listFiles(rootDir, ".");
  return [
    `Goal: ${task.goal}`,
    `Source files: ${srcCount}`,
    `Test files: ${testCount}`,
    `Top-level entries: ${topDirs.slice(0, 10).join(", ")}`,
  ].join("\n");
}

async function runTestRunner(rootDir: string, task: AgentTask): Promise<string> {
  requireTool(task, "filesystem:read");
  const pkgPath = path.join(rootDir, "package.json");
  if (!existsSync(pkgPath)) {
    return `Goal: ${task.goal}\nNo package.json found.`;
  }
  const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
  const script = pkg.scripts?.test || "";
  const testCount = await countSourceFiles(rootDir, "tests");
  return [
    `Goal: ${task.goal}`,
    `Test script: ${script || "none"}`,
    `Test files: ${testCount}`,
  ].join("\n");
}

async function runResearcher(rootDir: string, task: AgentTask): Promise<string> {
  requireTool(task, "filesystem:read");
  const readmePath = path.join(rootDir, "README.md");
  let headings: string[] = [];
  if (existsSync(readmePath)) {
    const content = await fs.readFile(readmePath, "utf-8");
    headings = content
      .split("\n")
      .filter((line) => line.startsWith("#"))
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .filter(Boolean);
  }
  return [
    `Goal: ${task.goal}`,
    `README headings: ${headings.slice(0, 6).join(", ") || "none"}`,
  ].join("\n");
}

async function runDocWriter(rootDir: string, task: AgentTask): Promise<string> {
  requireTool(task, "filesystem:read");
  const pkgPath = path.join(rootDir, "package.json");
  let packageName = "hatchling";
  let version = "unknown";
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string; version?: string };
    packageName = pkg.name || packageName;
    version = pkg.version || version;
  }
  return [
    `# ${packageName} - Draft Notes`,
    "",
    `Goal: ${task.goal}`,
    "",
    `Version: ${version}`,
    "",
    "## Summary",
    "Captured initial notes for future documentation.",
    "",
    "## Next Topics",
    "- Architecture overview",
    "- Runtime loops",
    "- Safety model",
  ].join("\n");
}

async function runExperimenter(rootDir: string, task: AgentTask): Promise<string> {
  requireTool(task, "filesystem:read");
  const pkgPath = path.join(rootDir, "package.json");
  let depCount = 0;
  let devDepCount = 0;
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    depCount = pkg.dependencies ? Object.keys(pkg.dependencies).length : 0;
    devDepCount = pkg.devDependencies ? Object.keys(pkg.devDependencies).length : 0;
  }
  return [
    `Goal: ${task.goal}`,
    `Dependencies: ${depCount}`,
    `Dev dependencies: ${devDepCount}`,
    `Experiment: dependency mix ratio ${(depCount + devDepCount) > 0
      ? (depCount / (depCount + devDepCount)).toFixed(2)
      : "0.00"}`,
  ].join("\n");
}

registerAgentRunner("code_analyzer", runCodeAnalyzer);
registerAgentRunner("test_runner", runTestRunner);
registerAgentRunner("researcher", runResearcher);
registerAgentRunner("doc_writer", runDocWriter);
registerAgentRunner("experimenter", runExperimenter);

export async function executeAgentTask(rootDir: string, task: AgentTask): Promise<AgentResult> {
  const activePayload = await readJsonOrDefault<{ agents: AgentTask[] }>(rootDir, ACTIVE_FILE, { agents: [] });
  const activeAgents = ensureArray(activePayload.agents) as AgentTask[];
  const index = activeAgents.findIndex((entry) => entry.id === task.id);
  const startedAt = nowIso();
  let status: AgentStatus = "running";

  const runningTask = sanitizeTask({ ...task, status, startedAt }, status);
  if (index >= 0) {
    activeAgents[index] = runningTask;
  } else {
    activeAgents.push(runningTask);
  }
  await updateActiveAgents(rootDir, activeAgents);

  let output = "";
  let error = "";
  try {
    const runner = getAgentRunner(task.type);
    output = await runner(rootDir, runningTask);
    status = "completed";
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    output = `Failure: ${error}`;
  }

  const finishedAt = nowIso();
  const completedTask: AgentTask = {
    ...runningTask,
    status,
    finishedAt,
    error: error || undefined,
  };

  const result: AgentResult = {
    id: `${task.id}-result`,
    agentId: task.id,
    status,
    output,
    createdAt: runningTask.createdAt,
    finishedAt,
  };

  await appendResult(rootDir, result);
  await appendHistory(rootDir, makeHistoryEntry(completedTask, status, result.id, error || undefined));
  const remaining = activeAgents.filter((entry) => entry.id !== task.id);
  await updateActiveAgents(rootDir, remaining);

  return result;
}
