import fs from "fs/promises";
import path from "path";
import { runInteractiveDiscovery } from "./discovery.js";
import { generateDNAFiles } from "./dna-generator.js";

interface OnboardingConfig {
  provider: string;
  model: string;
}

export async function runSelfDiscovery(config: OnboardingConfig, rootDir: string): Promise<string> {
  // Create .self directory
  const selfDir = path.join(rootDir, ".self");
  await fs.mkdir(selfDir, { recursive: true });

  // Run interactive discovery conversation (includes name)
  const conversationData = await runInteractiveDiscovery(
    config.provider,
    config.model,
    rootDir
  );

  const agentName = conversationData.name;

  // Generate DNA files from conversation
  await generateDNAFiles(selfDir, agentName, conversationData);
  
  // Create config in brain directory
  const brainDir = path.join(rootDir, "brain");
  await fs.mkdir(brainDir, { recursive: true });
  
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

  // Initialize other state files
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

  return agentName;
}
