import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

export interface StagedSkill {
  name: string;
  description: string;
  createdAt: string;
  status: "staged";
}

const execFileAsync = promisify(execFile);

function validateSkillName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    throw new Error("Skill name must contain only lowercase letters, numbers, dashes, and underscores.");
  }
  return normalized;
}

function normalizeSkillNameFromSource(source: string): string {
  const base = path.basename(source).trim().toLowerCase().replace(/\s+/g, "-");
  return validateSkillName(base || "imported-skill");
}

export async function stageSkill(
  rootDir: string,
  name: string,
  description: string,
): Promise<StagedSkill> {
  const normalizedName = validateSkillName(name);
  const skillDir = path.join(rootDir, "limbs_staging", normalizedName);
  if (existsSync(skillDir)) {
    throw new Error(`Skill '${normalizedName}' is already staged.`);
  }
  const now = new Date().toISOString();
  const manifest: StagedSkill = {
    name: normalizedName,
    description: description.trim(),
    createdAt: now,
    status: "staged",
  };
  const skillDoc = `# ${normalizedName}\n\n${description.trim()}\n\n## Usage\n- Add concrete usage instructions.\n- Add guardrails.\n- Add examples.\n`;

  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), skillDoc, "utf-8");
  await fs.writeFile(path.join(skillDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  return manifest;
}

export async function promoteSkill(rootDir: string, name: string): Promise<string> {
  const normalizedName = validateSkillName(name);
  const stagedDir = path.join(rootDir, "limbs_staging", normalizedName);
  const activeDir = path.join(rootDir, "limbs", normalizedName);

  if (!existsSync(stagedDir)) {
    throw new Error(`Staged skill '${normalizedName}' not found.`);
  }
  if (existsSync(activeDir)) {
    throw new Error(`Active skill '${normalizedName}' already exists.`);
  }

  await fs.rename(stagedDir, activeDir);
  return activeDir;
}

export async function listSkills(rootDir: string): Promise<{
  active: string[];
  staged: string[];
}> {
  const listDir = async (dir: string): Promise<string[]> => {
    if (!existsSync(dir)) return [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  };

  return {
    active: await listDir(path.join(rootDir, "limbs")),
    staged: await listDir(path.join(rootDir, "limbs_staging")),
  };
}

export async function installSkillFromDirectory(
  rootDir: string,
  sourceDir: string,
  targetName?: string,
): Promise<string> {
  const resolvedSource = path.resolve(sourceDir);
  const skillDoc = path.join(resolvedSource, "SKILL.md");
  if (!existsSync(resolvedSource)) {
    throw new Error(`Skill source does not exist: ${resolvedSource}`);
  }
  if (!existsSync(skillDoc)) {
    throw new Error(`Skill source must contain SKILL.md: ${resolvedSource}`);
  }

  const normalizedName = targetName
    ? validateSkillName(targetName)
    : normalizeSkillNameFromSource(resolvedSource);
  const activeDir = path.join(rootDir, "limbs", normalizedName);
  if (existsSync(activeDir)) {
    throw new Error(`Active skill '${normalizedName}' already exists.`);
  }

  await fs.mkdir(path.dirname(activeDir), { recursive: true });
  await fs.cp(resolvedSource, activeDir, { recursive: true });
  return activeDir;
}

function isRepoSource(source: string): boolean {
  return /^(https?:\/\/|ssh:\/\/|git@|file:\/\/)/i.test(source) || source.endsWith(".git");
}

async function cloneRepoToTemp(source: string): Promise<string> {
  const cloneBase = await fs.mkdtemp(path.join(os.tmpdir(), "hatchling-skill-"));
  const target = path.join(cloneBase, "repo");
  await execFileAsync("git", ["clone", "--depth", "1", source, target], {
    timeout: 120000,
  });
  return target;
}

export async function installSkillFromSource(
  rootDir: string,
  source: string,
  targetName?: string,
  subdir?: string,
): Promise<string> {
  const trimmedSource = source.trim();
  const relativeSubdir = (subdir || "").trim();

  if (!trimmedSource) {
    throw new Error("Skill source is required.");
  }

  if (existsSync(trimmedSource)) {
    const sourcePath = relativeSubdir
      ? path.join(path.resolve(trimmedSource), relativeSubdir)
      : trimmedSource;
    return installSkillFromDirectory(rootDir, sourcePath, targetName);
  }

  if (!isRepoSource(trimmedSource)) {
    throw new Error(`Unsupported skill source: ${trimmedSource}`);
  }

  let clonedPath = "";
  try {
    clonedPath = await cloneRepoToTemp(trimmedSource);
    const sourcePath = relativeSubdir ? path.join(clonedPath, relativeSubdir) : clonedPath;
    return await installSkillFromDirectory(rootDir, sourcePath, targetName);
  } catch (error: any) {
    throw new Error(`Failed to install skill from repository: ${error.message || String(error)}`);
  } finally {
    if (clonedPath) {
      const root = path.dirname(clonedPath);
      await fs.rm(root, { recursive: true, force: true });
    }
  }
}
