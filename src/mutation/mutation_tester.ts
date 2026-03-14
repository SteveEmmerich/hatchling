import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import type { StagedMutation } from "./mutation_staging.js";

const execAsync = promisify(exec);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export interface MutationTestResult {
  ok: boolean;
  errors: string[];
  stdout?: string;
}

function resolveTscCommand(workDir: string, instancePath: string): string {
  const binName = process.platform === "win32" ? "tsc.cmd" : "tsc";
  const candidates = [
    path.join(workDir, "node_modules", ".bin", binName),
    path.join(instancePath, "node_modules", ".bin", binName),
    path.resolve(moduleDir, "..", "..", "node_modules", ".bin", binName),
  ];
  const direct = candidates.find((p) => existsSync(p));
  if (direct) {
    return `"${direct}" --noEmit`;
  }
  return "npx tsc --noEmit";
}

async function ensureNodeModules(workDir: string, instancePath: string): Promise<void> {
  const target = path.join(workDir, "node_modules");
  if (existsSync(target)) return;
  const candidates = [
    path.join(instancePath, "node_modules"),
    path.resolve(moduleDir, "..", "..", "node_modules"),
  ];
  const source = candidates.find((p) => existsSync(p));
  if (!source) return;
  try {
    await fs.symlink(source, target, "dir");
  } catch {
    // Ignore if symlink fails; tsc may still resolve globally.
  }
}

async function copyIfExists(from: string, to: string): Promise<void> {
  if (!existsSync(from)) return;
  await fs.copyFile(from, to);
}

async function prepareWorktree(instancePath: string, staged: StagedMutation): Promise<string> {
  const workDir = path.join(staged.stagingDir, "worktree");
  await fs.mkdir(workDir, { recursive: true });
  await fs.cp(path.join(instancePath, "src"), path.join(workDir, "src"), { recursive: true });
  await copyIfExists(path.join(instancePath, "tsconfig.json"), path.join(workDir, "tsconfig.json"));
  await copyIfExists(path.join(instancePath, "package.json"), path.join(workDir, "package.json"));
  await ensureNodeModules(workDir, instancePath);

  const overlayPath = path.join(workDir, staged.normalizedPath);
  await fs.mkdir(path.dirname(overlayPath), { recursive: true });
  await fs.copyFile(staged.stagedPath, overlayPath);
  return workDir;
}

export async function runTypeCheck(projectDir: string, instancePath: string): Promise<MutationTestResult> {
  try {
    const { stdout, stderr } = await execAsync(resolveTscCommand(projectDir, instancePath), {
      cwd: projectDir,
    });
    if (stderr && !stderr.includes("warning")) {
      return { ok: false, errors: [stderr], stdout };
    }
    return { ok: true, errors: [], stdout };
  } catch (error: any) {
    return { ok: false, errors: [error?.stdout || error?.message || String(error)] };
  }
}

export async function runMutationTests(
  instancePath: string,
  staged: StagedMutation,
): Promise<MutationTestResult> {
  try {
    const workDir = await prepareWorktree(instancePath, staged);
    return await runTypeCheck(workDir, instancePath);
  } catch (error: any) {
    return { ok: false, errors: [error?.message || String(error)] };
  }
}
