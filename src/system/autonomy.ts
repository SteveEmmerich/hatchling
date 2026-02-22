import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { executeEvolutionPlan, listRiskyEvolveActions, planEvolution, type EvolveExecutionResult, type EvolvePlan } from "./evolve.js";
import {
  appendAutonomyReflection,
  applyRunToStrategy,
  seedStrategyGoals,
  selectNextGoals,
  type StrategyGoal,
} from "./autonomy-strategy.js";

const AUTONOMY_LOG_FILE = "brain/autonomy_runs.json";

export interface AutonomousStep {
  index: number;
  objective: string;
  plan: EvolvePlan;
  riskyActions: string[];
  approvalRequired: boolean;
  status: "planned" | "skipped" | "blocked" | "executed" | "failed";
  results: EvolveExecutionResult[];
}

export interface AutonomousRunOptions {
  maxSteps?: number;
  execute?: boolean;
  enforceApprovals?: boolean;
  approvePlan?: boolean;
  approveUntrusted?: boolean;
  skillSubdir?: string;
  stopOnFailure?: boolean;
  useStrategy?: boolean;
}

export interface AutonomousRunResult {
  ok: boolean;
  runId: string;
  goal: string;
  execute: boolean;
  objectives: string[];
  steps: AutonomousStep[];
  stoppedReason?: string;
}

interface AutonomyLogPayload {
  runs: Array<{
    runId: string;
    goal: string;
    execute: boolean;
    createdAt: string;
    ok: boolean;
    objectives: string[];
    stoppedReason?: string;
    steps: Array<{
      index: number;
      objective: string;
      status: string;
      riskyActions: string[];
      planActionTypes: string[];
      resultSummary: Array<{ type: string; success: boolean }>;
    }>;
  }>;
}

function runId(): string {
  return `auto_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitObjectives(goal: string, maxSteps: number): string[] {
  const chunks = goal
    .split(/\bthen\b|->|[\n;]+/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (chunks.length === 0) {
    return [goal.trim()].filter(Boolean).slice(0, maxSteps);
  }
  return chunks.slice(0, maxSteps);
}

function objectiveListFromStrategy(goals: StrategyGoal[]): string[] {
  return goals.map((goal) => goal.objective);
}

async function readLog(rootDir: string): Promise<AutonomyLogPayload> {
  const target = path.join(rootDir, AUTONOMY_LOG_FILE);
  if (!existsSync(target)) return { runs: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as AutonomyLogPayload;
    if (!parsed || !Array.isArray(parsed.runs)) return { runs: [] };
    return parsed;
  } catch {
    return { runs: [] };
  }
}

async function appendLog(rootDir: string, result: AutonomousRunResult): Promise<void> {
  const target = path.join(rootDir, AUTONOMY_LOG_FILE);
  const payload = await readLog(rootDir);
  payload.runs.push({
    runId: result.runId,
    goal: result.goal,
    execute: result.execute,
    createdAt: new Date().toISOString(),
    ok: result.ok,
    objectives: result.objectives,
    stoppedReason: result.stoppedReason,
    steps: result.steps.map((step) => ({
      index: step.index,
      objective: step.objective,
      status: step.status,
      riskyActions: step.riskyActions,
      planActionTypes: step.plan.actions.map((action) => action.type),
      resultSummary: step.results.map((entry) => ({ type: entry.type, success: entry.success })),
    })),
  });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(payload, null, 2), "utf-8");
}

export async function runAutonomousEvolution(
  rootDir: string,
  goal: string,
  options: AutonomousRunOptions = {},
): Promise<AutonomousRunResult> {
  const maxSteps = Math.max(1, Number(options.maxSteps || 5));
  const execute = Boolean(options.execute);
  const useStrategy = options.useStrategy !== false;
  const requestedObjectives = splitObjectives(goal, maxSteps);
  let objectives = requestedObjectives;
  if (useStrategy) {
    const seeded = await seedStrategyGoals(rootDir, requestedObjectives);
    objectives = objectiveListFromStrategy(selectNextGoals(seeded, maxSteps));
  }
  const run = runId();
  const steps: AutonomousStep[] = [];
  let stoppedReason = "";

  for (let i = 0; i < objectives.length; i += 1) {
    const objective = objectives[i];
    const plan = planEvolution(objective);
    const risky = listRiskyEvolveActions(plan).map((action) => action.type);
    const approvalRequired = Boolean(options.enforceApprovals) && risky.length > 0;

    if (!plan.actions.length) {
      steps.push({
        index: i + 1,
        objective,
        plan,
        riskyActions: risky,
        approvalRequired,
        status: "skipped",
        results: [],
      });
      continue;
    }

    if (!execute) {
      steps.push({
        index: i + 1,
        objective,
        plan,
        riskyActions: risky,
        approvalRequired,
        status: "planned",
        results: [],
      });
      continue;
    }

    if (approvalRequired && !options.approvePlan) {
      steps.push({
        index: i + 1,
        objective,
        plan,
        riskyActions: risky,
        approvalRequired,
        status: "blocked",
        results: [],
      });
      stoppedReason = "approval_required";
      break;
    }

    const results = await executeEvolutionPlan(rootDir, plan, {
      approveUntrusted: Boolean(options.approveUntrusted),
      skillSubdir: options.skillSubdir,
    });
    const failed = results.some((entry) => !entry.success);
    steps.push({
      index: i + 1,
      objective,
      plan,
      riskyActions: risky,
      approvalRequired,
      status: failed ? "failed" : "executed",
      results,
    });
    if (failed && options.stopOnFailure !== false) {
      stoppedReason = "step_failed";
      break;
    }
  }

  const ok = stoppedReason === "" && steps.every((step) => step.status !== "failed" && step.status !== "blocked");
  const result: AutonomousRunResult = {
    ok,
    runId: run,
    goal,
    execute,
    objectives,
    steps,
    stoppedReason: stoppedReason || undefined,
  };
  await appendLog(rootDir, result);
  if (useStrategy) {
    await applyRunToStrategy(rootDir, steps);
    await appendAutonomyReflection(rootDir, result);
  }
  return result;
}
