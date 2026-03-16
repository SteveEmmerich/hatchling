import { runInteractiveDiscovery } from "./discovery.js";
import { createInstance, setActiveInstance } from "./instance.js";
import { generateDNAFiles } from "./dna-generator.js";
import { basename, join } from "path";
import type { Identity } from "./identity-schema.js";
import { ensureCuriosityState } from "../curiosity/curiosity_engine.js";
import { ensureAgentState } from "../agents/agent_manager.js";
import { ensureMemoryState } from "../memory/memory_manager.js";
import { ensureTraitState } from "../organism/behavior_context.js";
import { updateSocialMemoryEntry } from "../memory/memory_manager.js";
import { ensureMutationSuggestionStore } from "../mutation/mutation_suggestions.js";
import fs from "fs/promises";
import { PathGuard } from "./pathGuard.js";
import path from "path";
import type { BirthSeed } from "./birth-extraction.js";

export interface OnboardOptions {
  provider: string;
  model: string;
  seedIdentity?: Partial<Identity>;
}

export async function runSelfDiscovery(
  options: OnboardOptions,
): Promise<string> {
  try {
    // Run the LLM-driven discovery conversation
    const discovery = await runInteractiveDiscovery(
      options.provider,
      options.model,
      options.seedIdentity,
    );
    const identity = discovery.identity;
    const seed = discovery.seed;

    // Create the instance with the discovered name
    const instanceDir = await createInstance({
      name: identity.name,
      provider: options.provider,
      model: options.model,
    });

    // Set as active
    await setActiveInstance(basename(instanceDir));

    // Write the discovered identity to the instance
    const brainDir = join(instanceDir, "brain");
    await generateDNAFiles(brainDir, identity);
    await ensureCuriosityState(instanceDir);
    await ensureAgentState(instanceDir);
    await ensureMemoryState(instanceDir);
    await ensureTraitState(instanceDir);
    await ensureMutationSuggestionStore(instanceDir);
    await applyBirthSeed(instanceDir, seed);

    return instanceDir;
  } catch (error) {
    console.error("Failed to complete self-discovery:", error);
    throw error;
  }
}

async function applyBirthSeed(rootDir: string, seed: BirthSeed): Promise<void> {
  if (!seed) return;
  PathGuard.setRoot(rootDir);
  const userName = seed.userName ? String(seed.userName).trim() : "";
  if (userName) {
    await updateSocialMemoryEntry(rootDir, "user:primary", {
      facts: { name: userName },
      notes: [`Onboarded with ${userName}`],
      interactionCount: 1,
    });
  }

  const selfPath = await PathGuard.validatePath("brain/self/self_model.json", "write");
  try {
    const current = JSON.parse(await fs.readFile(selfPath, "utf-8")) as Record<string, unknown>;
    const merged = {
      ...current,
      userName: userName || current.userName,
      archetype: seed.archetype || current.archetype,
      collaborationGoals: seed.collaborationGoals && seed.collaborationGoals.length > 0
        ? seed.collaborationGoals
        : current.collaborationGoals,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(selfPath, JSON.stringify(merged, null, 2), "utf-8");
  } catch {
    // Ignore optional self model merge failures.
  }

  if (typeof seed.curiosityBaseline === "number") {
    const curiosityValue = Math.max(1, Math.min(9, Number(seed.curiosityBaseline)));
    const curiosityStatePath = await PathGuard.validatePath("brain/curiosity_state.json", "write");
    try {
      const state = JSON.parse(await fs.readFile(curiosityStatePath, "utf-8")) as Record<string, unknown>;
      state.adjustedCuriosity = curiosityValue;
      state.lastCalculated = new Date().toISOString();
      await fs.writeFile(curiosityStatePath, JSON.stringify(state, null, 2), "utf-8");
    } catch {
      await fs.writeFile(
        curiosityStatePath,
        JSON.stringify({ adjustedCuriosity: curiosityValue, lastCalculated: new Date().toISOString(), adjustments: [] }, null, 2),
        "utf-8",
      );
    }

    const curiosityPath = path.join(rootDir, "brain", "curiosity.json");
    try {
      const state = JSON.parse(await fs.readFile(curiosityPath, "utf-8")) as Record<string, unknown>;
      state.curiosity = curiosityValue;
      await fs.writeFile(curiosityPath, JSON.stringify(state, null, 2), "utf-8");
    } catch {
      // ignore if curiosity.json missing
    }
  }
}
