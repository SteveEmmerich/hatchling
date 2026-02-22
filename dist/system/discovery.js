import { runHindbrainDiscovery } from "./hindbrain-discovery.js";
import { parseIdentity } from "./identity-schema.js";
/**
 * Run interactive discovery conversation to define agent identity
 * Falls back to hindbrain if external provider fails
 */
export async function runInteractiveDiscovery(provider, model, seedIdentity) {
    console.log(`\n🎭 Starting self-discovery conversation...`);
    console.log(`Provider: ${provider}, Model: ${model}`);
    console.log(`🧠 Hindbrain onboarding engaged.\n`);
    if (seedIdentity) {
        return parseIdentity({
            name: seedIdentity.name,
            purpose: seedIdentity.purpose,
            personality: seedIdentity.personality,
        });
    }
    return runHindbrainDiscovery();
}
//# sourceMappingURL=discovery.js.map