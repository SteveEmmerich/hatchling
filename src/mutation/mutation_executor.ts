import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import type { MutationProposal } from "./mutation_pipeline.js";
import type { StagedMutation } from "./mutation_staging.js";
import { runTypeCheck } from "./mutation_tester.js";

const execAsync = promisify(exec);

export interface MutationExecutionResult {
  ok: boolean;
  commitHash?: string;
  errors?: string[];
}

async function commitMutation(instancePath: string, normalizedPath: string, proposalId: string): Promise<string | undefined> {
  await execAsync(`git add "${normalizedPath}"`, { cwd: instancePath });
  const { stdout: status } = await execAsync("git status --porcelain", { cwd: instancePath });
  if (!status.trim()) {
    return undefined;
  }
  await execAsync(`git commit -m "Mutation: ${normalizedPath} (${proposalId})"`, { cwd: instancePath });
  const { stdout } = await execAsync("git rev-parse HEAD", { cwd: instancePath });
  return stdout.trim();
}

export async function applyMutation(
  instancePath: string,
  proposal: MutationProposal,
  staged: StagedMutation,
): Promise<MutationExecutionResult> {
  const fullPath = path.join(instancePath, proposal.normalizedPath);
  const existed = existsSync(fullPath);
  const previousContent = existed ? await fs.readFile(fullPath, "utf-8") : null;

  try {
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, proposal.content, "utf-8");

    const check = await runTypeCheck(instancePath, instancePath);
    if (!check.ok) {
      throw new Error(check.errors.join("\n"));
    }

    const commitHash = await commitMutation(instancePath, proposal.normalizedPath, proposal.id);
    return { ok: true, commitHash };
  } catch (error: any) {
    try {
      if (previousContent === null) {
        if (existsSync(fullPath)) await fs.unlink(fullPath);
      } else {
        await fs.writeFile(fullPath, previousContent, "utf-8");
      }
    } catch {
      // Ignore rollback errors; surface original failure.
    }
    return { ok: false, errors: [error?.message || String(error)] };
  }
}
