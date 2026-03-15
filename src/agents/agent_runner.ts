import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { spawn } from "child_process";
import { PathGuard } from "../system/pathGuard.js";
import {
  type AgentTask,
  type AgentResult,
  type AgentHistoryEntry,
  type AgentStatus,
  type AgentStructuredResult,
  type AgentFinding,
  type AgentFollowupHint,
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

function hasTool(task: AgentTask, tool: string): boolean {
  return task.allowed_tools.includes(tool);
}

function truncate(value: string, max = 2000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function parseTargetFromGoal(goal: string, fallback: string): string {
  const match = goal.match(/(?:path|target)\s*[:=]\s*([^\s]+)/i);
  if (match && match[1]) return match[1];
  if (goal.includes("tests/")) return "tests";
  if (goal.includes("src/")) return "src";
  return fallback;
}

function buildStructuredResult(summary: string, findings: AgentFinding[], confidence = 0.6, suggestedFollowups?: AgentFollowupHint[]): AgentStructuredResult {
  return {
    summary,
    findings,
    confidence: Math.max(0, Math.min(1, Number(confidence) || 0.5)),
    suggestedFollowups: suggestedFollowups && suggestedFollowups.length > 0 ? suggestedFollowups : undefined,
  };
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

async function countSourceFiles(rootDir: string, relative: string, limit = 200): Promise<number> {
  const fullPath = path.join(rootDir, relative);
  let count = 0;
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      count += await countSourceFiles(rootDir, path.join(relative, entry.name), limit);
      if (count >= limit) break;
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      count += 1;
    }
    if (count >= limit) break;
  }
  return count;
}

async function collectFileStats(rootDir: string, relative: string, limit = 200): Promise<Array<{ path: string; size: number }>> {
  const fullPath = path.join(rootDir, relative);
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  const results: Array<{ path: string; size: number }> = [];
  for (const entry of entries) {
    const entryPath = path.join(fullPath, entry.name);
    if (entry.isDirectory()) {
      const child = await collectFileStats(rootDir, path.join(relative, entry.name), limit - results.length);
      results.push(...child);
    } else if (/\.(ts|tsx|js|mjs|cjs|json|md)$/.test(entry.name)) {
      const stat = await fs.stat(entryPath);
      results.push({ path: path.join(relative, entry.name), size: stat.size });
    }
    if (results.length >= limit) break;
  }
  return results;
}

async function listTestNames(rootDir: string): Promise<Set<string>> {
  const testsPath = path.join(rootDir, "tests");
  const names = new Set<string>();
  if (!existsSync(testsPath)) return names;
  const entries = await collectFileStats(rootDir, "tests", 200);
  for (const entry of entries) {
    const base = path.basename(entry.path).replace(/\.(test|spec)\.(ts|tsx|js|mjs|cjs)$/, "");
    if (base) names.add(base.toLowerCase());
  }
  return names;
}

async function runCodeAnalyzer(rootDir: string, task: AgentTask): Promise<AgentStructuredResult> {
  requireTool(task, "filesystem:read");
  const target = parseTargetFromGoal(task.goal, "src");
  const srcStats = await collectFileStats(rootDir, target, 200);
  const testNames = await listTestNames(rootDir);
  const fileCount = srcStats.length;
  const largeFiles = srcStats
    .filter((entry) => entry.size >= 400 * 1024)
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);
  const missingTests = srcStats
    .filter((entry) => /\.(ts|tsx|js|mjs|cjs)$/.test(entry.path))
    .map((entry) => path.basename(entry.path).replace(/\.(ts|tsx|js|mjs|cjs)$/, ""))
    .filter((name) => !testNames.has(name.toLowerCase()))
    .slice(0, 5);
  const topDirs = srcStats.reduce<Record<string, number>>((acc, entry) => {
    const parts = entry.path.split(path.sep);
    const dir = parts.length > 1 ? parts[0] : ".";
    acc[dir] = (acc[dir] || 0) + 1;
    return acc;
  }, {});
  const hotspots = Object.entries(topDirs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dir, count]) => `${dir} (${count} files)`);

  const findings: AgentFinding[] = [
    { label: "file_count", detail: `${fileCount} files scanned in ${target}`, severity: "low" },
  ];
  if (largeFiles.length > 0) {
    findings.push({
      label: "large_files",
      detail: largeFiles.map((entry) => `${entry.path} (${Math.round(entry.size / 1024)}kb)`).join(", "),
      severity: "medium",
    });
  }
  if (missingTests.length > 0) {
    findings.push({
      label: "missing_tests_hint",
      detail: `No obvious tests for: ${missingTests.join(", ")}`,
      severity: "low",
    });
  }
  if (hotspots.length > 0) {
    findings.push({
      label: "hotspots",
      detail: `Directory hotspots: ${hotspots.join(", ")}`,
      severity: "low",
    });
  }

  const summary = `Analyzed ${fileCount} files in ${target}. Large files: ${largeFiles.length}.`;
  const followups: AgentFollowupHint[] = [];
  if (missingTests.length > 0) {
    followups.push({ type: "project_task", detail: "Add tests for uncovered modules." });
  }
  if (largeFiles.length > 0) {
    followups.push({ type: "project_task", detail: "Review large files for modularization." });
  }
  return buildStructuredResult(summary, findings, 0.7, followups);
}

async function runCommand(rootDir: string, command: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: rootDir, env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: truncate(stdout, 2000), stderr: truncate(stderr, 2000) });
    });
  });
}

async function runTestRunner(rootDir: string, task: AgentTask): Promise<AgentStructuredResult> {
  requireTool(task, "filesystem:read");
  if (!hasTool(task, "process:exec")) {
    throw new Error("Tool not allowed: process:exec");
  }
  const testsPath = path.join(rootDir, "tests");
  let targetTest = "";
  if (existsSync(testsPath)) {
    const files = await collectFileStats(rootDir, "tests", 50);
    const candidate = files.find((entry) => /\.test\.(mjs|js|ts|tsx)$/.test(entry.path));
    if (candidate) targetTest = candidate.path;
  }
  const args = targetTest ? ["--test", targetTest] : ["--test", "tests/**/*.test.mjs"];
  const timeout = Math.max(2000, Math.min(task.time_limit, 60000));
  const result = await runCommand(rootDir, "node", args, timeout);
  const summary = result.code === 0 ? "Tests passed" : "Tests failed";
  const findings: AgentFinding[] = [
    { label: "command", detail: `node ${args.join(" ")}`, severity: "low" },
    { label: "exit_code", detail: String(result.code ?? "unknown"), severity: result.code === 0 ? "low" : "high" },
  ];
  if (result.stderr) {
    findings.push({ label: "stderr", detail: result.stderr, severity: "medium" });
  }
  if (result.stdout) {
    findings.push({ label: "stdout", detail: result.stdout, severity: "low" });
  }
  const followups: AgentFollowupHint[] = [];
  if (result.code !== 0) {
    followups.push({ type: "maintenance", detail: "Inspect failing tests and stabilize the suite." });
  }
  return buildStructuredResult(summary, findings, result.code === 0 ? 0.8 : 0.4, followups);
}

async function runResearcher(rootDir: string, task: AgentTask): Promise<AgentStructuredResult> {
  requireTool(task, "filesystem:read");
  const readmePath = path.join(rootDir, "README.md");
  const pkgPath = path.join(rootDir, "package.json");
  let headings: string[] = [];
  if (existsSync(readmePath)) {
    const content = truncate(await fs.readFile(readmePath, "utf-8"), 4000);
    headings = content
      .split("\n")
      .filter((line) => line.startsWith("#"))
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .filter(Boolean);
  }
  let packageName = "unknown";
  let version = "unknown";
  let scripts: string[] = [];
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string; version?: string; scripts?: Record<string, string> };
    packageName = pkg.name || packageName;
    version = pkg.version || version;
    scripts = pkg.scripts ? Object.keys(pkg.scripts).slice(0, 6) : [];
  }
  const findings: AgentFinding[] = [
    { label: "package", detail: `${packageName} @ ${version}`, severity: "low" },
  ];
  if (headings.length > 0) {
    findings.push({ label: "readme_headings", detail: headings.slice(0, 6).join(", "), severity: "low" });
  }
  if (scripts.length > 0) {
    findings.push({ label: "scripts", detail: scripts.join(", "), severity: "low" });
  }
  const summary = `Researched local project metadata for ${packageName}.`;
  const followups: AgentFollowupHint[] = [
    { type: "curiosity_task", detail: "Review README sections for missing operational guidance." },
  ];
  return buildStructuredResult(summary, findings, 0.7, followups);
}

async function runDocWriter(rootDir: string, task: AgentTask): Promise<AgentStructuredResult> {
  requireTool(task, "filesystem:read");
  const pkgPath = path.join(rootDir, "package.json");
  let packageName = "hatchling";
  let version = "unknown";
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8")) as { name?: string; version?: string };
    packageName = pkg.name || packageName;
    version = pkg.version || version;
  }
  const summary = `Drafted documentation cues for ${packageName}.`;
  const findings: AgentFinding[] = [
    { label: "goal", detail: task.goal, severity: "low" },
    { label: "version", detail: version, severity: "low" },
  ];
  return buildStructuredResult(summary, findings, 0.5);
}

async function runExperimenter(rootDir: string, task: AgentTask): Promise<AgentStructuredResult> {
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
  const mix = (depCount + devDepCount) > 0 ? (depCount / (depCount + devDepCount)).toFixed(2) : "0.00";
  return buildStructuredResult(
    `Checked dependency mix ratio ${mix}.`,
    [
      { label: "dependencies", detail: String(depCount), severity: "low" },
      { label: "dev_dependencies", detail: String(devDepCount), severity: "low" },
    ],
    0.4,
  );
}

registerAgentRunner("code_analyzer", runCodeAnalyzer);
registerAgentRunner("test_runner", runTestRunner);
registerAgentRunner("researcher", runResearcher);
registerAgentRunner("doc_writer", runDocWriter);
registerAgentRunner("experimenter", runExperimenter);

export async function executeAgentTask(rootDir: string, task: AgentTask): Promise<AgentResult> {
  PathGuard.setRoot(rootDir);
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
  let structured: AgentStructuredResult | undefined;
  let error = "";
  try {
    const runner = getAgentRunner(task.type);
    structured = await runner(rootDir, runningTask);
    output = structured.summary;
    status = "completed";
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? err.message : String(err);
    structured = buildStructuredResult("Agent failed to complete task.", [{ label: "error", detail: error, severity: "high" }], 0.1);
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
    agentType: task.type,
    status,
    output,
    result: structured,
    createdAt: runningTask.createdAt,
    finishedAt,
  };

  await appendResult(rootDir, result);
  await appendHistory(rootDir, makeHistoryEntry(completedTask, status, result.id, error || undefined));
  const remaining = activeAgents.filter((entry) => entry.id !== task.id);
  await updateActiveAgents(rootDir, remaining);

  return result;
}
