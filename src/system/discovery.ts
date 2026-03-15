import type { Identity } from "./identity-schema";
import { parseIdentity } from "./identity-schema.js";
import type { BirthSeed } from "./birth-extraction.js";
import { runHindbrainBirth } from "./hindbrain-discovery.js";

export interface DiscoveryResult {
  identity: Identity;
  seed: BirthSeed;
}

/**
 * Run interactive discovery conversation to define agent identity
 * Falls back to hindbrain if external provider fails
 */
export async function runInteractiveDiscovery(
  provider: string,
  model: string,
  seedIdentity?: Partial<Identity>,
): Promise<DiscoveryResult> {
  console.log(`\n🎭 Starting self-discovery conversation...`);
  console.log(`Provider: ${provider}, Model: ${model}`);
  console.log(`🧠 Hindbrain onboarding engaged.\n`);
  if (seedIdentity) {
    const identity = parseIdentity({
      name: seedIdentity.name,
      purpose: seedIdentity.purpose,
      personality: seedIdentity.personality,
    });
    return {
      identity,
      seed: {
        organismName: identity.name,
        purposeHint: identity.purpose,
        personalityHints: identity.personality,
      },
    };
  }
  return runHindbrainBirth();
}
