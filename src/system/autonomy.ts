import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { executeEvolutionPlan, listRiskyEvolveActions, planEvolution, type EvolveExecutionResult, type EvolvePlan } from "./evolve.js";
import { getEvolvePolicy } from "./control-plane.js";
import { summarizeTrust } from "./social-memory.js";
import {
  appendAutonomyReflection,
  applyRunToStrategy,
  seedStrategyGoals,
  seedStrategyGoalsWithPriority,
  selectNextGoals,
  synthesizeStrategicObjectives,
  type StrategyGoal,
} from "./autonomy-strategy.js";
import { reflectEvent } from "../brain/reflection_engine.js";

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
  strategyGeneratedObjectives: string[];
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
    strategyGeneratedObjectives?: string[];
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

async function loadCuriosityLevel(rootDir: string): Promise<number> {
  const target = path.join(rootDir, "brain", "curiosity_state.json");
  if (!existsSync(target)) return 5;
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as { adjustedCuriosity?: number };
    const value = Number(parsed.adjustedCuriosity ?? 5);
    if (!Number.isFinite(value)) return 5;
    return Math.max(0, Math.min(10, value));
  } catch {
    return 5;
  }
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
    strategyGeneratedObjectives: result.strategyGeneratedObjectives,
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
  let maxSteps = Math.max(1, Number(options.maxSteps || 5));
  const curiosity = await loadCuriosityLevel(rootDir);
  const trustSummary = await summarizeTrust(rootDir);
  const curiosityDelta = Math.round((curiosity - 5) / 2);
  const trustDelta = trustSummary.average >= 70 ? 1 : trustSummary.average < 45 ? -1 : 0;
  maxSteps = Math.max(1, Math.min(8, maxSteps + curiosityDelta + trustDelta));
  const execute = Boolean(options.execute);
  const useStrategy = options.useStrategy !== false;
  let enforceApprovals = options.enforceApprovals;
  if (enforceApprovals === undefined) {
    const policy = await getEvolvePolicy(rootDir);
    enforceApprovals = policy.enforceApprovals;
  }
  if (trustSummary.count > 0 && trustSummary.average < 45) {
    enforceApprovals = true;
  }
  const requestedObjectives = splitObjectives(goal, maxSteps);
  let strategyGeneratedObjectives: string[] = [];
  let objectives = requestedObjectives;
  if (useStrategy) {
    await seedStrategyGoals(rootDir, requestedObjectives);
    strategyGeneratedObjectives = await synthesizeStrategicObjectives(rootDir, Math.max(1, Math.floor(maxSteps / 2)));
    const seeded = await seedStrategyGoalsWithPriority(rootDir, strategyGeneratedObjectives, 0.35);
    objectives = objectiveListFromStrategy(selectNextGoals(seeded, maxSteps));
  }
  const run = runId();
  const steps: AutonomousStep[] = [];
  let stoppedReason = "";

  for (let i = 0; i < objectives.length; i += 1) {
    const objective = objectives[i];
    const plan = planEvolution(objective);
    const risky = listRiskyEvolveActions(plan).map((action) => action.type);
    const approvalRequired = Boolean(enforceApprovals) && risky.length > 0;

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
      approvePlan: Boolean(options.approvePlan),
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
    strategyGeneratedObjectives,
    steps,
    stoppedReason: stoppedReason || undefined,
  };
  await appendLog(rootDir, result);
  if (useStrategy) {
    await applyRunToStrategy(rootDir, steps);
    await appendAutonomyReflection(rootDir, result);
    const executed = steps.filter((step) => step.status === "executed").length;
    const failed = steps.filter((step) => step.status === "failed").length;
    const blocked = steps.filter((step) => step.status === "blocked").length;
    await reflectEvent(rootDir, {
      type: "autonomy",
      outcome: `Autonomy run ${result.ok ? "completed" : "stopped"} (${run})`,
      result: `executed=${executed}, failed=${failed}, blocked=${blocked}`,
      context: {
        goal,
        taskType: "autonomy",
        metadata: { runId: run },
      },
      timestamp: new Date().toISOString(),
      allowMutationSuggestion: false,
    });
  }
  return result;
}
