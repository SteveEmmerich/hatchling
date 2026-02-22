/**
 * Instance Manager - Handles Divergent Evolution
 * Each hatchling instance gets its own cloned src/ and package.json in ~/.hatchlings/<name>/
 */

import { existsSync } from "fs";
import { mkdir, cp, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

function getHatchlingHome(): string {
  return process.env.HATCHLING_HOME || homedir();
}

function getHatchlingsDir(): string {
  return join(getHatchlingHome(), ".hatchlings");
}

function getActiveInstanceFile(): string {
  return join(getHatchlingHome(), ".hatchling_active");
}

export interface InstanceConfig {
  name: string;
  provider: string;
  model: string;
  createdAt: string;
  lastActive: string;
}

/**
 * Get the path to the germline (core hatchling source)
 */
export function getGermlinePath(): string {
  // This is the root of the hatchling-core project
  return process.cwd();
}

/**
 * Get the path to an instance's phenotype (cloned copy)
 */
export function getInstancePath(name: string): string {
  return join(getHatchlingsDir(), name);
}

/**
 * Create a new hatchling instance by cloning the germline
 */
export async function createInstance(options: {
  name: string;
  provider: string;
  model: string;
}): Promise<string> {
  const { name, provider, model } = options;
  let instancePath = getInstancePath(name);
  let finalName = name;
  
  // Handle duplicate names gracefully
  if (existsSync(instancePath)) {
    let counter = 2;
    while (existsSync(getInstancePath(`${name}-${counter}`))) {
      counter++;
    }
    finalName = `${name}-${counter}`;
    instancePath = getInstancePath(finalName);
    console.log(`⚠️  Instance '${name}' already exists. Using '${finalName}' instead.`);
  }

  // Ensure ~/.hatchlings/ exists
  await mkdir(getHatchlingsDir(), { recursive: true });

  const germlinePath = getGermlinePath();

  // Clone the entire src/ directory
  await cp(join(germlinePath, "src"), join(instancePath, "src"), {
    recursive: true,
  });

  // Copy package.json
  await cp(join(germlinePath, "package.json"), join(instancePath, "package.json"));

  // Copy tsconfig.json
  await cp(join(germlinePath, "tsconfig.json"), join(instancePath, "tsconfig.json"));

  // Create instance-specific directories
  await mkdir(join(instancePath, "brain"), { recursive: true });
  await mkdir(join(instancePath, "memory"), { recursive: true });
  await mkdir(join(instancePath, "memory", "daily"), { recursive: true });
  await mkdir(join(instancePath, "memory", "sleep_logs"), { recursive: true });
  await mkdir(join(instancePath, "memory", "telemetry"), { recursive: true });
  await mkdir(join(instancePath, "limbs"), { recursive: true });
  await mkdir(join(instancePath, "limbs_staging"), { recursive: true });
  await mkdir(join(instancePath, "projects"), { recursive: true });

  // Create instance config
  const config: InstanceConfig = {
    name: finalName,
    provider,
    model,
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
  };

  await writeFile(
    join(instancePath, "brain", "config.json"),
    JSON.stringify(config, null, 2)
  );

  // Initialize git in the instance and link to germline
  try {
    // Step 1: git init (MUST succeed or instance is corrupt)
    execSync("git init", { cwd: instancePath, stdio: "pipe" });
    
    // Step 2: Configure git identity
    execSync(`git config user.name "Hatchling ${name}"`, {
      cwd: instancePath,
      stdio: "pipe",
    });
    execSync(`git config user.email "${name}@hatchling.local"`, {
      cwd: instancePath,
      stdio: "pipe",
    });
    execSync("git config commit.gpgsign false", {
      cwd: instancePath,
      stdio: "pipe",
    });
    
    // Step 3: WAIT for git init to complete, then add germline remote
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify git was initialized
    if (!existsSync(join(instancePath, ".git"))) {
      throw new Error("Git initialization failed: .git directory not created");
    }
    
    // Add germline remote pointing to the core hatchling project
    execSync(`git remote add germline ${germlinePath}`, {
      cwd: instancePath,
      stdio: "pipe",
    });
    
    // Step 4: Initial commit
    execSync("git add .", { cwd: instancePath, stdio: "pipe" });
    execSync('git commit -m "Genesis: Instance cloned from germline"', {
      cwd: instancePath,
      stdio: "pipe",
    });
  } catch (error) {
    // CRITICAL: If git setup fails, the instance is corrupt
    console.error("FATAL: Failed to initialize git repository:", error);
    throw new Error(`Instance creation failed: Git initialization error - ${error}`);
  }

  return instancePath;
}

/**
 * Get the currently active instance name
 */
export async function getActiveInstance(): Promise<string | null> {
  try {
    const activeInstanceFile = getActiveInstanceFile();
    if (!existsSync(activeInstanceFile)) {
      return null;
    }
    const name = await readFile(activeInstanceFile, "utf-8");
    return name.trim();
  } catch {
    return null;
  }
}

/**
 * Set the active instance
 */
export async function setActiveInstance(name: string): Promise<void> {
  const instancePath = getInstancePath(name);
  
  if (!existsSync(instancePath)) {
    throw new Error(`Instance '${name}' does not exist at ${instancePath}`);
  }

  await writeFile(getActiveInstanceFile(), name);

  // Update lastActive timestamp
  const configPath = join(instancePath, "brain", "config.json");
  if (existsSync(configPath)) {
    const config = JSON.parse(await readFile(configPath, "utf-8"));
    config.lastActive = new Date().toISOString();
    await writeFile(configPath, JSON.stringify(config, null, 2));
  }
}

/**
 * List all hatchling instances
 */
export async function listInstances(): Promise<InstanceConfig[]> {
  const hatchlingsDir = getHatchlingsDir();
  if (!existsSync(hatchlingsDir)) {
    return [];
  }

  const { readdir } = await import("fs/promises");
  const entries = await readdir(hatchlingsDir, { withFileTypes: true });
  
  const instances: InstanceConfig[] = [];
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const configPath = join(hatchlingsDir, entry.name, "brain", "config.json");
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(await readFile(configPath, "utf-8"));
          instances.push(config);
        } catch {
          // Skip invalid configs
        }
      }
    }
  }
  
  return instances.sort((a, b) => 
    new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
  );
}

/**
 * Delete an instance
 */
export async function deleteInstance(name: string): Promise<void> {
  const instancePath = getInstancePath(name);
  
  if (!existsSync(instancePath)) {
    throw new Error(`Instance '${name}' does not exist`);
  }

  const { rm } = await import("fs/promises");
  await rm(instancePath, { recursive: true, force: true });

  // Clear active instance if it was this one
  const activeInstance = await getActiveInstance();
  if (activeInstance === name) {
      const { unlink } = await import("fs/promises");
      try {
        await unlink(getActiveInstanceFile());
      } catch {
        // Ignore if file doesn't exist
      }
  }
}
