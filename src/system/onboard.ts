import fs from "fs/promises";
import path from "path";
import os from "os";
import { runInteractiveDiscovery } from "./discovery.js";
import { generateDNAFiles } from "./dna-generator.js";

interface OnboardingConfig {
  provider: string;
  model: string;
}

export async function runSelfDiscovery(config: OnboardingConfig): Promise<{ name: string; instanceDir: string }> {
  // Step 1: Create a temporary directory for discovery telemetry
  const tempDir = path.join(os.tmpdir(), `hatchling-discovery-${Date.now()}`);
  await fs.mkdir(path.join(tempDir, "memory", "telemetry"), { recursive: true });
  
  // Run discovery to get the agent's name first
  const conversationData = await runInteractiveDiscovery(
    config.provider,
    config.model,
    tempDir
  );
  
  // Clean up temp directory
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

  const agentName = conversationData.name;

  // Step 2: Create instance directory in user's home
  const instanceDir = path.join(os.homedir(), `.hatchling-${agentName.toLowerCase()}`);
  await fs.mkdir(instanceDir, { recursive: true });

  // Step 3: Create required subdirectories
  const selfDir = path.join(instanceDir, ".self");
  const brainDir = path.join(instanceDir, "brain");
  const memoryDir = path.join(instanceDir, "memory");
  const limbsDir = path.join(instanceDir, "limbs");
  const limbsStagingDir = path.join(instanceDir, "limbs_staging");
  const projectsDir = path.join(instanceDir, "projects");

  await Promise.all([
    fs.mkdir(selfDir, { recursive: true }),
    fs.mkdir(brainDir, { recursive: true }),
    fs.mkdir(path.join(memoryDir, "daily"), { recursive: true }),
    fs.mkdir(path.join(memoryDir, "sleep_logs"), { recursive: true }),
    fs.mkdir(path.join(memoryDir, "telemetry"), { recursive: true }),
    fs.mkdir(path.join(memoryDir, "backups"), { recursive: true }),
    fs.mkdir(limbsDir, { recursive: true }),
    fs.mkdir(limbsStagingDir, { recursive: true }),
    fs.mkdir(projectsDir, { recursive: true }),
  ]);

  // Step 4: Generate DNA files from conversation
  await generateDNAFiles(selfDir, agentName, conversationData);

  // Step 5: Create config in brain directory
  const configPath = path.join(brainDir, "config.json");
  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        model: config.model,
        provider: config.provider,
        agentName: agentName,
        curiosityLevel: 5,
        maxDailyMutations: 3,
        quotas: {
          diskGB: 1,
          tokensPerDay: 1000000,
          cpuPercent: 50,
        },
      },
      null,
      2
    )
  );

  // Step 6: Initialize state files
  await fs.writeFile(
    path.join(brainDir, "mutation_state.json"),
    JSON.stringify({ mutationsThisCycle: 0, dailyCap: 3, lastReset: new Date().toISOString() }, null, 2)
  );

  await fs.writeFile(
    path.join(brainDir, "curiosity_state.json"),
    JSON.stringify({ level: 5, adjustments: [], lastUpdate: new Date().toISOString() }, null, 2)
  );

  await fs.writeFile(
    path.join(brainDir, "EVOLUTION_LOG.json"),
    JSON.stringify({ sleepCycles: 0, rollbacks: 0, heuristics: [], startedAt: new Date().toISOString() }, null, 2)
  );

  await fs.writeFile(
    path.join(brainDir, "quotas.json"),
    JSON.stringify({
      disk: { used: 0, limit: 1000000000 },
      tokens: { used: 0, limit: 1000000, resetAt: new Date().toISOString() },
      cpu: { limit: 50 },
    }, null, 2)
  );

  // Step 7: Initialize git repository
  const { exec } = await import("child_process");
  const { promisify } = await import("util");
  const execAsync = promisify(exec);

  try {
    await execAsync("git init", { cwd: instanceDir });
    await execAsync('git config user.name "Hatchling Organism"', { cwd: instanceDir });
    await execAsync('git config user.email "hatchling@local"', { cwd: instanceDir });
    await execAsync("git add .", { cwd: instanceDir });
    await execAsync('git commit -m "Genesis: Constitutional DNA established\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"', { cwd: instanceDir });
  } catch (error) {
    console.warn("Git initialization failed:", error);
  }

  return { name: agentName, instanceDir };
}
