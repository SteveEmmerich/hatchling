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
const SKILL_POLICY_FILE = "brain/skill_policy.json";

export interface SkillInstallPolicy {
  allowedHosts: string[];
  allowLocalPaths: boolean;
  requireApprovalForUntrusted: boolean;
}

export interface SkillInstallOptions {
  approveUntrusted?: boolean;
}

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

function defaultPolicy(): SkillInstallPolicy {
  return {
    allowedHosts: ["github.com", "gitlab.com", "bitbucket.org"],
    allowLocalPaths: true,
    requireApprovalForUntrusted: true,
  };
}

async function readPolicy(rootDir: string): Promise<SkillInstallPolicy> {
  const policyPath = path.join(rootDir, SKILL_POLICY_FILE);
  if (!existsSync(policyPath)) {
    return defaultPolicy();
  }
  try {
    const parsed = JSON.parse(await fs.readFile(policyPath, "utf-8")) as Partial<SkillInstallPolicy>;
    return {
      allowedHosts: Array.isArray(parsed.allowedHosts)
        ? parsed.allowedHosts.map((host) => String(host).toLowerCase())
        : defaultPolicy().allowedHosts,
      allowLocalPaths: parsed.allowLocalPaths !== false,
      requireApprovalForUntrusted: parsed.requireApprovalForUntrusted !== false,
    };
  } catch {
    return defaultPolicy();
  }
}

function resolveSourceHost(source: string): string | null {
  if (/^git@/i.test(source)) {
    const match = source.match(/^git@([^:]+):/i);
    return match ? match[1].toLowerCase() : null;
  }
  if (/^https?:\/\//i.test(source) || /^ssh:\/\//i.test(source)) {
    try {
      return new URL(source).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
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
  options: SkillInstallOptions = {},
): Promise<string> {
  const trimmedSource = source.trim();
  const relativeSubdir = (subdir || "").trim();
  const policy = await readPolicy(rootDir);
  const approveUntrusted = Boolean(options.approveUntrusted);

  if (!trimmedSource) {
    throw new Error("Skill source is required.");
  }

  if (existsSync(trimmedSource)) {
    if (!policy.allowLocalPaths) {
      throw new Error("Local skill installs are disabled by policy.");
    }
    const sourcePath = relativeSubdir
      ? path.join(path.resolve(trimmedSource), relativeSubdir)
      : trimmedSource;
    return installSkillFromDirectory(rootDir, sourcePath, targetName);
  }

  if (!isRepoSource(trimmedSource)) {
    throw new Error(`Unsupported skill source: ${trimmedSource}`);
  }
  if (trimmedSource.startsWith("file://")) {
    if (!policy.allowLocalPaths) {
      throw new Error("file:// skill installs are disabled by policy.");
    }
  } else {
    const host = resolveSourceHost(trimmedSource);
    const trusted = host ? policy.allowedHosts.includes(host) : false;
    if (!trusted && policy.requireApprovalForUntrusted && !approveUntrusted) {
      throw new Error(
        `Untrusted repository source '${trimmedSource}'. Re-run with approval to continue.`,
      );
    }
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
