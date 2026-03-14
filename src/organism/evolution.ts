/**
 * evolution.ts - Self-Evolution & Genetic Recombination
 * Allows the organism to mutate its own code and sync with the germline
 */

import { promises as fs } from "fs";
import { existsSync } from "fs";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { runMutationPipeline } from "../mutation/mutation_pipeline.js";

const execAsync = promisify(exec);
async function resolveGermlineRef(instancePath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      "git symbolic-ref --short refs/remotes/germline/HEAD",
      { cwd: instancePath },
    );
    const ref = stdout.trim();
    if (ref) {
      return ref;
    }
  } catch {
    // Fall through to standard defaults.
  }
  return "germline/main";
}

export interface MutationResult {
  success: boolean;
  message: string;
  errors?: string[];
}

export interface RecombinationResult {
  success: boolean;
  message: string;
  conflicts?: string[];
}

/**
 * Mutate: Allow agent to modify its own local src/ files
 * Validates integrity with TypeScript compiler after mutation
 */
export async function mutate(
  instancePath: string,
  filePath: string,
  content: string,
  approved = false,
): Promise<MutationResult> {
  try {
    const pipeline = await runMutationPipeline(instancePath, {
      filePath,
      content,
      approved,
    });
    if (pipeline.status === "committed") {
      return {
        success: true,
        message: pipeline.message,
      };
    }
    return {
      success: false,
      message: pipeline.message,
      errors: pipeline.errors,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Mutation error: ${error.message}`,
    };
  }
}

/**
 * Recombine: Sync with germline (core species updates)
 * Performs git fetch + merge while preserving local mutations
 */
export async function recombine(
  instancePath: string
): Promise<RecombinationResult> {
  try {
    // Check if git repo exists
    try {
      await execAsync("git rev-parse --git-dir", { cwd: instancePath });
    } catch {
      return {
        success: false,
        message: "Instance is not a git repository",
      };
    }

    // Check if germline remote exists
    const { stdout: remotes } = await execAsync("git remote", {
      cwd: instancePath,
    });
    if (!remotes.includes("germline")) {
      return {
        success: false,
        message: "Germline remote not configured",
      };
    }

    // Fetch from germline
    await execAsync("git fetch germline", { cwd: instancePath });
    const germlineRef = await resolveGermlineRef(instancePath);

    // Attempt merge
    try {
      await execAsync(`git merge ${germlineRef} --no-edit`, {
        cwd: instancePath,
      });

      return {
        success: true,
        message: "Successfully recombined with germline",
      };
    } catch (error: any) {
      // Check if it's a merge conflict
      const { stdout: status } = await execAsync("git status --porcelain", {
        cwd: instancePath,
      });

      if (status.includes("UU") || status.includes("AA")) {
        // Get conflicted files
        const conflicts = status
          .split("\n")
          .filter((line) => line.startsWith("UU") || line.startsWith("AA"))
          .map((line) => line.substring(3).trim());

        return {
          success: false,
          message: "Recombination conflict: Manual resolution required",
          conflicts,
        };
      }

      return {
        success: false,
        message: `Recombination failed: ${error.message}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `Recombination error: ${error.message}`,
    };
  }
}

/**
 * Get current genetic lineage info
 */
export async function getLineageInfo(instancePath: string): Promise<{
  currentCommit: string;
  germlineCommit: string;
  divergence: number;
  mutations: number;
}> {
  try {
    const germlineRef = await resolveGermlineRef(instancePath);

    const { stdout: currentCommit } = await execAsync(
      "git rev-parse --short HEAD",
      { cwd: instancePath }
    );

    const { stdout: germlineCommit } = await execAsync(
      `git rev-parse --short ${germlineRef}`,
      { cwd: instancePath }
    );

    const { stdout: divergenceStr } = await execAsync(
      `git rev-list --count HEAD..${germlineRef}`,
      { cwd: instancePath }
    );

    const { stdout: mutationsStr } = await execAsync(
      `git rev-list --count ${germlineRef}..HEAD`,
      { cwd: instancePath }
    );

    return {
      currentCommit: currentCommit.trim(),
      germlineCommit: germlineCommit.trim(),
      divergence: parseInt(divergenceStr.trim()) || 0,
      mutations: parseInt(mutationsStr.trim()) || 0,
    };
  } catch (error) {
    return {
      currentCommit: "unknown",
      germlineCommit: "unknown",
      divergence: 0,
      mutations: 0,
    };
  }
}
