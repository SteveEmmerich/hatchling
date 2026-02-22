import { runInteractiveDiscovery } from "./discovery.js";
import { createInstance, setActiveInstance } from "./instance.js";
import { generateDNAFiles } from "./dna-generator.js";
import { basename, join } from "path";
export async function runSelfDiscovery(options) {
    try {
        // Run the LLM-driven discovery conversation
        const identity = await runInteractiveDiscovery(options.provider, options.model, options.seedIdentity);
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
        return instanceDir;
    }
    catch (error) {
        console.error("Failed to complete self-discovery:", error);
        throw error;
    }
}
//# sourceMappingURL=onboard.js.map