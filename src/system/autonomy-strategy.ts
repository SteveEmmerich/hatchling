import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { AutonomousRunResult, AutonomousStep } from "./autonomy.js";

const STRATEGY_FILE = "brain/autonomy_strategy.json";
const REFLECTION_FILE = "brain/autonomy_reflections.md";

export interface StrategyGoal {
  id: string;
  objective: string;
  key: string;
  status: "pending" | "completed";
  priority: number;
  attempts: number;
  successes: number;
  failures: number;
  blocked: number;
  lastOutcome: "planned" | "skipped" | "blocked" | "executed" | "failed" | "seeded";
  createdAt: string;
  updatedAt: string;
}

export interface AutonomyStrategy {
  version: 1;
  goals: StrategyGoal[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function strategyPath(rootDir: string): string {
  return path.join(rootDir, STRATEGY_FILE);
}

function reflectionPath(rootDir: string): string {
  return path.join(rootDir, REFLECTION_FILE);
}

function normalizeObjective(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function randomId(): string {
  return `goal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadAutonomyStrategy(rootDir: string): Promise<AutonomyStrategy> {
  const target = strategyPath(rootDir);
  if (!existsSync(target)) return { version: 1, goals: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as AutonomyStrategy;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.goals)) {
      return { version: 1, goals: [] };
    }
    return parsed;
  } catch {
    return { version: 1, goals: [] };
  }
}

async function saveAutonomyStrategy(rootDir: string, strategy: AutonomyStrategy): Promise<void> {
  const target = strategyPath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(strategy, null, 2), "utf-8");
}

export async function seedStrategyGoals(rootDir: string, objectives: string[]): Promise<AutonomyStrategy> {
  return seedStrategyGoalsWithPriority(rootDir, objectives, 1);
}

export async function seedStrategyGoalsWithPriority(
  rootDir: string,
  objectives: string[],
  priority = 1,
): Promise<AutonomyStrategy> {
  const strategy = await loadAutonomyStrategy(rootDir);
  const timestamp = nowIso();
  for (const objective of objectives) {
    const key = normalizeObjective(objective);
    if (!key) continue;
    const existing = strategy.goals.find((goal) => goal.key === key);
    if (existing) continue;
    strategy.goals.push({
      id: randomId(),
      objective: objective.trim(),
      key,
      status: "pending",
      priority: Math.max(0.1, Number(priority) || 1),
      attempts: 0,
      successes: 0,
      failures: 0,
      blocked: 0,
      lastOutcome: "seeded",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  await saveAutonomyStrategy(rootDir, strategy);
  return strategy;
}

async function readJsonOrDefault<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export async function synthesizeStrategicObjectives(rootDir: string, maxObjectives = 3): Promise<string[]> {
  const goals: string[] = [];
  const capabilities = await readJsonOrDefault<{ capabilities?: Record<string, { enabled?: boolean }> }>(
    path.join(rootDir, "brain", "capabilities.json"),
    { capabilities: {} },
  );
  const personality = await readJsonOrDefault<{ signals?: { stress?: number; caution?: number }; totalFeedback?: number }>(
    path.join(rootDir, "brain", "personality_state.json"),
    { signals: { stress: 3, caution: 4 }, totalFeedback: 0 },
  );
  const mcp = await readJsonOrDefault<{ servers?: Array<{ enabled?: boolean }> }>(
    path.join(rootDir, "brain", "mcp_servers.json"),
    { servers: [] },
  );
  const hasTelegram = Boolean(capabilities.capabilities?.["channel.telegram"]?.enabled);
  const hasWhatsApp = Boolean(capabilities.capabilities?.["channel.whatsapp"]?.enabled);
  const stress = Number(personality.signals?.stress || 0);
  const caution = Number(personality.signals?.caution || 0);
  const totalFeedback = Number(personality.totalFeedback || 0);
  const enabledServers = Array.isArray(mcp.servers)
    ? mcp.servers.filter((server) => server?.enabled !== false).length
    : 0;

  if (hasTelegram || hasWhatsApp) {
    goals.push("Review channel routing decisions and add one improved policy rule for common intents");
  }
  if (enabledServers === 0) {
    goals.push("Install and enable one MCP server that matches the current communication workflow");
  }
  if (stress >= 6 || caution >= 7) {
    goals.push("Run a reliability hardening pass and reduce operational risk in active loops");
  }
  if (totalFeedback >= 5) {
    goals.push("Summarize repeated user feedback patterns and encode one actionable behavior update");
  }
  goals.push("Audit autonomy backlog priorities and retire stale pending goals");
  const unique = Array.from(new Set(goals.map((goal) => goal.trim()).filter(Boolean)));
  return unique.slice(0, Math.max(1, Math.floor(maxObjectives)));
}

export function selectNextGoals(strategy: AutonomyStrategy, maxSteps: number): StrategyGoal[] {
  return strategy.goals
    .filter((goal) => goal.status === "pending")
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;
      return a.createdAt.localeCompare(b.createdAt);
    })
    .slice(0, maxSteps);
}

function applyStepOutcome(goal: StrategyGoal, step: AutonomousStep): void {
  const timestamp = nowIso();
  goal.lastOutcome = step.status;
  goal.updatedAt = timestamp;

  if (step.status === "planned" || step.status === "skipped") {
    if (step.status === "skipped") {
      goal.status = "completed";
      goal.priority = Math.max(0.2, goal.priority - 0.5);
    }
    return;
  }

  goal.attempts += 1;
  if (step.status === "executed") {
    goal.successes += 1;
    goal.status = "completed";
    goal.priority = Math.max(0.2, goal.priority - 0.75);
  } else if (step.status === "failed") {
    goal.failures += 1;
    goal.status = "pending";
    goal.priority = Math.min(10, goal.priority + 2);
  } else if (step.status === "blocked") {
    goal.blocked += 1;
    goal.status = "pending";
    goal.priority = Math.min(10, goal.priority + 1.5);
  }
}

export async function applyRunToStrategy(
  rootDir: string,
  steps: AutonomousStep[],
): Promise<AutonomyStrategy> {
  const strategy = await loadAutonomyStrategy(rootDir);
  for (const step of steps) {
    const key = normalizeObjective(step.objective);
    const goal = strategy.goals.find((entry) => entry.key === key);
    if (!goal) continue;
    applyStepOutcome(goal, step);
  }
  await saveAutonomyStrategy(rootDir, strategy);
  return strategy;
}

export async function appendAutonomyReflection(rootDir: string, result: AutonomousRunResult): Promise<void> {
  const strategy = await loadAutonomyStrategy(rootDir);
  const pendingTop = selectNextGoals(strategy, 3).map((goal) => `${goal.objective} (p=${goal.priority.toFixed(2)})`);
  const executed = result.steps.filter((step) => step.status === "executed").length;
  const failed = result.steps.filter((step) => step.status === "failed").length;
  const blocked = result.steps.filter((step) => step.status === "blocked").length;

  const content = [
    `## ${new Date().toISOString()} · ${result.runId}`,
    `- Goal: ${result.goal}`,
    `- Execute mode: ${result.execute ? "yes" : "no"}`,
    `- Outcome: ${result.ok ? "ok" : "not-ok"}${result.stoppedReason ? ` (${result.stoppedReason})` : ""}`,
    `- Steps: executed=${executed}, failed=${failed}, blocked=${blocked}`,
    `- Next priorities: ${pendingTop.length ? pendingTop.join("; ") : "none"}`,
    "",
  ].join("\n");

  const target = reflectionPath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${content}\n`, "utf-8");
}
