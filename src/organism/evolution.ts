/**
 * evolution.ts - Self-Evolution & Genetic Recombination
 * Allows the organism to mutate its own code and sync with the germline
 */

import { promises as fs } from "fs";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { SecurityScanner } from "../system/scanner.js";
import { generateResponse } from "../brain/hindbrain.js";

const execAsync = promisify(exec);
const moduleDir = dirname(fileURLToPath(import.meta.url));

function resolveTscCommand(instancePath: string): string {
  const binName = process.platform === "win32" ? "tsc.cmd" : "tsc";
  const candidates = [
    join(instancePath, "node_modules", ".bin", binName),
    resolve(moduleDir, "..", "..", "node_modules", ".bin", binName),
  ];
  const direct = candidates.find((p) => existsSync(p));
  if (direct) {
    return `"${direct}" --noEmit`;
  }
  return "npx tsc --noEmit";
}

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

async function runConstitutionCheck(
  instancePath: string,
  normalizedPath: string,
  content: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (process.env.HATCHLING_CONSTITUTION_CHECK === "0") {
    return { ok: true };
  }

  let constitution = "1. Territory Isolation\n2. Protected Brain\n3. Code Safety (No rm/eval)";
  try {
    const constitutionPath = join(instancePath, "brain", "CONSTITUTION.md");
    constitution = await fs.readFile(constitutionPath, "utf-8");
  } catch {
    // Use default constitution when file is missing.
  }

  const prompt = `
CONSTITUTION:
${constitution}

TARGET FILE: ${normalizedPath}
CODE:
${content}

Does this change violate the constitution? Reply ONLY "SAFE" or "UNSAFE: <reason>".
`;

  try {
    const response = await generateResponse(prompt, { temperature: 0.1, maxTokens: 200 });
    const trimmed = String(response || "").trim();
    if (/^SAFE\b/i.test(trimmed)) {
      return { ok: true };
    }
    if (/^UNSAFE\b/i.test(trimmed)) {
      return { ok: false, reason: trimmed };
    }
    return { ok: false, reason: `Constitution check failed: ${trimmed || "unrecognized response"}` };
  } catch (error: any) {
    return { ok: false, reason: error?.message || "Constitution check failed" };
  }
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
    const policyPath = join(instancePath, "brain", "evolve_policy.json");
    let enforceApprovals = false;
    try {
      const policy = JSON.parse(await fs.readFile(policyPath, "utf-8")) as { enforceApprovals?: boolean };
      enforceApprovals = Boolean(policy?.enforceApprovals);
    } catch {
      // Default to false when policy is missing.
    }
    if (enforceApprovals && !approved && process.env.HATCHLING_AUTO_APPROVE_MUTATIONS !== "1") {
      return {
        success: false,
        message: "Mutation blocked: approval required.",
      };
    }
    // Ensure file is within src/ directory
    const normalizedPath = filePath.startsWith("src/")
      ? filePath
      : `src/${filePath}`;
    const fullPath = join(instancePath, normalizedPath);

    // Validate path is within instance
    if (!fullPath.startsWith(instancePath)) {
      return {
        success: false,
        message: "Mutation rejected: Path outside instance territory",
      };
    }

    const relativePath = normalizedPath.replace(/^src\//, "");
    const existing = existsSync(fullPath);
    const previousContent = existing ? await fs.readFile(fullPath, "utf-8") : null;

    try {
      SecurityScanner.scanCode(content, relativePath || normalizedPath);
    } catch (scanError: any) {
      return {
        success: false,
        message: "Mutation rejected: Security scan failed",
        errors: [scanError?.message || String(scanError)],
      };
    }

    const constitutionCheck = await runConstitutionCheck(instancePath, normalizedPath, content);
    if (!constitutionCheck.ok) {
      return {
        success: false,
        message: "Mutation rejected: Constitution check failed",
        errors: [constitutionCheck.reason || "Constitution violation"],
      };
    }

    // Write mutation
    await fs.mkdir(join(instancePath, "src"), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");

    // Verify biological integrity with TypeScript
    try {
      const { stdout, stderr } = await execAsync(resolveTscCommand(instancePath), {
        cwd: instancePath,
      });

      if (stderr && !stderr.includes("warning")) {
        throw new Error(stderr);
      }

      return {
        success: true,
        message: `Successfully mutated ${normalizedPath}`,
      };
    } catch (error: any) {
      // TypeScript errors - rollback mutation
      try {
        if (previousContent === null) {
          await fs.unlink(fullPath);
        } else {
          await fs.writeFile(fullPath, previousContent, "utf-8");
        }
      } catch {
        // Ignore rollback errors; surface original failure.
      }
      return {
        success: false,
        message: "Mutation failed: Biological integrity check failed",
        errors: [error?.stdout || error?.message || String(error)],
      };
    }
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
