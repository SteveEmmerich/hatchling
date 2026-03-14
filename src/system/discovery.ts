import type { Identity } from "./identity-schema";
import { parseIdentity } from "./identity-schema.js";
import { createHindbrainInterface } from "../brain/hindbrain_interface.js";
import { createBrainRouter } from "../brain/brain_router.js";

/**
 * Run interactive discovery conversation to define agent identity
 * Falls back to hindbrain if external provider fails
 */
export async function runInteractiveDiscovery(
  provider: string,
  model: string,
  seedIdentity?: Partial<Identity>,
): Promise<Identity> {
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
  const hindbrain = createHindbrainInterface();
  const router = createBrainRouter({ hindbrain });
  const result = await router.handleOnboarding({});
  if (!result.ok || !result.data) {
    throw new Error(result.error || "Hindbrain onboarding failed");
  }
  return result.data as Identity;
}
