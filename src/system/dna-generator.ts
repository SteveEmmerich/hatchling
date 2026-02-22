import fs from "fs/promises";
import path from "path";
import type { Identity } from "./identity-schema";

/**
 * PATH: src/system/dna-generator.ts
 */
export async function generateDNAFiles(
  brainDir: string,
  data: Identity,
): Promise<void> {
  await fs.mkdir(brainDir, { recursive: true });
  const now = new Date().toISOString();
  const configPath = path.join(brainDir, "config.json");

  let existingConfig: Record<string, any> = {};
  try {
    existingConfig = JSON.parse(await fs.readFile(configPath, "utf-8"));
  } catch {
    // New instance without existing config.
  }

  const mergedConfig = {
    ...existingConfig,
    name: existingConfig.name ?? data.name,
    provider: existingConfig.provider ?? "hindbrain",
    model: existingConfig.model ?? "hindbrain-1b",
    createdAt: existingConfig.createdAt ?? now,
    lastActive: existingConfig.lastActive ?? now,
    agentName: data.name,
    mutations: {
      dailyCap: existingConfig.mutations?.dailyCap ?? 5,
    },
    quotas: {
      maxDiskUsageMB: existingConfig.quotas?.maxDiskUsageMB ?? 1024,
      maxTokensPerDay: existingConfig.quotas?.maxTokensPerDay ?? 100000,
    },
  };

  const dna = {
    "CONSTITUTION.md": `# Constitution\n1. Territory Isolation\n2. Protected Brain\n3. Code Safety (No rm/eval)`,
    "SOUL.md": `# Soul\nPurpose: ${data.purpose}\nPersonality: ${data.personality.join(", ")}`,
    "IDENTITY.md": `# Identity\nName: ${data.name}\nPurpose: ${data.purpose}`,
    "USER_CORE.md": `# User Core\nCreated: ${new Date().toISOString()}`,
    "USER_CONTEXT.md": `# User Context\nManifested: ${new Date().toLocaleString()}`,
    "config.json": JSON.stringify(mergedConfig, null, 2),
    "mutation_state.json": JSON.stringify(
      {
        mutationsToday: 0,
        mutationsThisCycle: 0,
        totalMutations: 0,
        successfulMutations: 0,
        lastReset: now.split("T")[0],
      },
      null,
      2,
    ),
    "curiosity_state.json": JSON.stringify(
      {
        adjustedCuriosity: 5,
        lastCalculated: now,
        adjustments: [],
      },
      null,
      2,
    ),
    "quotas.json": JSON.stringify(
      {
        tokens: {
          today: 0,
          month: 0,
          maxPerDay: 100000,
          resetDaily: now.split("T")[0],
        },
        disk: {
          current: 0,
          max: 1024 * 1024 * 1024,
        },
      },
      null,
      2,
    ),
    "EVOLUTION_LOG.json": JSON.stringify(
      {
        rollbacks: 0,
        sleepCycles: 0,
      },
      null,
      2,
    ),
    "skill_policy.json": JSON.stringify(
      {
        allowedHosts: ["github.com", "gitlab.com", "bitbucket.org"],
        allowLocalPaths: true,
        requireApprovalForUntrusted: true,
      },
      null,
      2,
    ),
    "mcp_servers.json": JSON.stringify({ servers: [] }, null, 2),
  };

  for (const [file, content] of Object.entries(dna)) {
    await fs.writeFile(path.join(brainDir, file), content);
  }
}
