import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { immuneSystem, toGateResult, type ImmuneGate } from "../immune/immune_system.js";
import { stageMutation, cleanupStaging, type StagedMutation } from "./mutation_staging.js";
import { runMutationTests, type MutationTestResult } from "./mutation_tester.js";
import { applyMutation } from "./mutation_executor.js";

export interface MutationProposalInput {
  filePath: string;
  content: string;
  approved?: boolean;
}

export interface MutationProposal {
  id: string;
  filePath: string;
  normalizedPath: string;
  content: string;
  approved: boolean;
  createdAt: string;
}

export interface MutationPipelineResult {
  proposalId: string;
  status: "denied" | "failed" | "committed";
  stage: "proposal" | "immune" | "staging" | "testing" | "finalize";
  allow?: ImmuneGate;
  testResult?: MutationTestResult;
  commitHash?: string;
  rollback?: { ok: boolean; reason?: string };
  message: string;
  errors?: string[];
}

const PIPELINE_LOG = "brain/mutation_pipeline.json";

function nowIso(): string {
  return new Date().toISOString();
}

function proposalId(): string {
  return `mut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function loadConstitution(instancePath: string): Promise<string> {
  let constitution = "1. Territory Isolation\n2. Protected Brain\n3. Code Safety (No rm/eval)";
  try {
    constitution = await fs.readFile(path.join(instancePath, "brain", "CONSTITUTION.md"), "utf-8");
  } catch {
    // Default constitution used when missing.
  }
  return constitution;
}

async function appendPipelineLog(instancePath: string, entry: MutationPipelineResult): Promise<void> {
  const target = path.join(instancePath, PIPELINE_LOG);
  const payload = existsSync(target)
    ? JSON.parse(await fs.readFile(target, "utf-8"))
    : { runs: [] as MutationPipelineResult[] };
  const runs = Array.isArray(payload.runs) ? payload.runs : [];
  runs.push(entry);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify({ runs }, null, 2), "utf-8");
}

async function checkApproval(instancePath: string, approved: boolean): Promise<{ ok: boolean; message?: string }> {
  const policyPath = path.join(instancePath, "brain", "evolve_policy.json");
  let enforceApprovals = false;
  try {
    const policy = JSON.parse(await fs.readFile(policyPath, "utf-8")) as { enforceApprovals?: boolean };
    enforceApprovals = Boolean(policy?.enforceApprovals);
  } catch {
    enforceApprovals = false;
  }
  if (enforceApprovals && !approved && process.env.HATCHLING_AUTO_APPROVE_MUTATIONS !== "1") {
    return { ok: false, message: "Mutation blocked: approval required." };
  }
  return { ok: true };
}

function normalizeProposal(input: MutationProposalInput): MutationProposal {
  const normalizedPath = input.filePath.startsWith("src/")
    ? input.filePath
    : `src/${input.filePath}`;
  return {
    id: proposalId(),
    filePath: input.filePath,
    normalizedPath,
    content: input.content,
    approved: Boolean(input.approved),
    createdAt: nowIso(),
  };
}

export async function runMutationPipeline(
  instancePath: string,
  input: MutationProposalInput,
): Promise<MutationPipelineResult> {
  const proposal = normalizeProposal(input);
  const fullPath = path.join(instancePath, proposal.normalizedPath);
  if (!fullPath.startsWith(instancePath)) {
    const result: MutationPipelineResult = {
      proposalId: proposal.id,
      status: "denied",
      stage: "proposal",
      message: "Mutation rejected: Path outside instance territory",
      errors: ["Path outside instance territory"],
    };
    await appendPipelineLog(instancePath, result);
    return result;
  }

  const approval = await checkApproval(instancePath, proposal.approved);
  if (!approval.ok) {
    const result: MutationPipelineResult = {
      proposalId: proposal.id,
      status: "denied",
      stage: "proposal",
      message: approval.message || "Mutation blocked: approval required.",
      errors: [approval.message || "approval_required"],
    };
    await appendPipelineLog(instancePath, result);
    return result;
  }

  const constitution = await loadConstitution(instancePath);
  const immuneCheck = await immuneSystem.validateMutationProposal({
    filePath: proposal.normalizedPath,
    content: proposal.content,
    constitution,
    checkConstitution: process.env.HATCHLING_CONSTITUTION_CHECK !== "0",
  });
  const immuneGate = toGateResult(immuneCheck, "immune_mutation");
  if (!immuneGate.allowed) {
    const result: MutationPipelineResult = {
      proposalId: proposal.id,
      status: "denied",
      stage: "immune",
      allow: immuneGate,
      message: "Mutation rejected: Immune validation failed",
      errors: immuneCheck.errors,
    };
    await appendPipelineLog(instancePath, result);
    return result;
  }

  let staged: StagedMutation | null = null;
  try {
    staged = await stageMutation(instancePath, proposal.id, proposal.normalizedPath, proposal.content);
  } catch (error: any) {
    const result: MutationPipelineResult = {
      proposalId: proposal.id,
      status: "failed",
      stage: "staging",
      allow: immuneGate,
      message: "Mutation failed: staging error",
      errors: [error?.message || String(error)],
    };
    await appendPipelineLog(instancePath, result);
    return result;
  }

  const testResult = await runMutationTests(instancePath, staged);
  if (!testResult.ok) {
    await cleanupStaging(staged);
    const result: MutationPipelineResult = {
      proposalId: proposal.id,
      status: "failed",
      stage: "testing",
      allow: immuneGate,
      testResult,
      message: "Mutation failed: Biological integrity check failed",
      errors: testResult.errors,
      rollback: { ok: true },
    };
    await appendPipelineLog(instancePath, result);
    return result;
  }

  const execution = await applyMutation(instancePath, proposal, staged);
  await cleanupStaging(staged);
  if (!execution.ok) {
    const result: MutationPipelineResult = {
      proposalId: proposal.id,
      status: "failed",
      stage: "finalize",
      allow: immuneGate,
      testResult,
      message: "Mutation failed: Finalization error",
      errors: execution.errors,
      rollback: { ok: true, reason: execution.errors?.[0] },
    };
    await appendPipelineLog(instancePath, result);
    return result;
  }

  const result: MutationPipelineResult = {
    proposalId: proposal.id,
    status: "committed",
    stage: "finalize",
    allow: immuneGate,
    testResult,
    commitHash: execution.commitHash,
    message: `Successfully mutated ${proposal.normalizedPath}`,
  };
  await appendPipelineLog(instancePath, result);
  return result;
}
