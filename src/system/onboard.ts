import { runInteractiveDiscovery } from "./discovery.js";
import { createInstance, setActiveInstance } from "./instance.js";
import { generateDNAFiles } from "./dna-generator.js";
import { basename, join } from "path";
import type { Identity } from "./identity-schema.js";
import { ensureCuriosityState } from "../curiosity/curiosity_engine.js";
import { ensureAgentState } from "../agents/agent_manager.js";
import { ensureMemoryState } from "../memory/memory_manager.js";

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
    const identity = await runInteractiveDiscovery(
      options.provider,
      options.model,
      options.seedIdentity,
    );

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

    return instanceDir;
  } catch (error) {
    console.error("Failed to complete self-discovery:", error);
    throw error;
  }
}
