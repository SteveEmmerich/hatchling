import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";

export interface StagedMutation {
  id: string;
  stagingDir: string;
  stagedPath: string;
  normalizedPath: string;
}

export async function stageMutation(
  instancePath: string,
  proposalId: string,
  normalizedPath: string,
  content: string,
): Promise<StagedMutation> {
  const stagingRoot = path.join(instancePath, ".mutation_staging");
  const stagingDir = path.join(stagingRoot, proposalId);
  const stagedPath = path.join(stagingDir, normalizedPath);

  await fs.mkdir(path.dirname(stagedPath), { recursive: true });
  await fs.writeFile(stagedPath, content, "utf-8");

  return {
    id: proposalId,
    stagingDir,
    stagedPath,
    normalizedPath,
  };
}

export async function cleanupStaging(staged: StagedMutation): Promise<void> {
  if (!existsSync(staged.stagingDir)) return;
  await fs.rm(staged.stagingDir, { recursive: true, force: true });
}
