/**
 * Hindbrain Discovery - Local conversational onboarding
 * Uses internal model when available; falls back to deterministic local prompts.
 */

import { initializeHindbrain, shutdown, generateResponse } from "../brain/hindbrain.js";
import * as clack from "@clack/prompts";
import { safeParseIdentity, type Identity } from "./identity-schema.js";

function parseTraits(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .flatMap((chunk) => chunk.split(/\s+and\s+/))
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function runHindbrainDiscovery(): Promise<Identity> {
  console.log("🧠 Using internal Hindbrain for discovery...");

  let hindbrainReady = true;
  try {
    await initializeHindbrain();
  } catch (error) {
    hindbrainReady = false;
    clack.log.warn(
      "Hindbrain model initialization failed. Continuing with local discovery prompts.",
    );
  }

  const intro = hindbrainReady
    ? await generateResponse(
        "Greet the user warmly and ask what they would like to name their new agent.",
      )
    : "Hi, I am your hatchling's hindbrain. What would you like to name your new agent?";

  clack.log.message(`🤖 ${intro}`);

  const nameResponse = await clack.text({
    message: "You",
    placeholder: "Type your response...",
  });
  if (clack.isCancel(nameResponse)) {
    await shutdown().catch(() => {});
    throw new Error("Discovery cancelled by user");
  }

  const purposeQuestion = hindbrainReady
    ? await generateResponse(
        `Ask about the purpose of an agent named \"${nameResponse as string}\" in one sentence.`,
      )
    : "What is this agent's purpose?";

  clack.log.message(`🤖 ${purposeQuestion}`);

  const purposeResponse = await clack.text({
    message: "You",
    placeholder: "Type your response...",
  });
  if (clack.isCancel(purposeResponse)) {
    await shutdown().catch(() => {});
    throw new Error("Discovery cancelled by user");
  }

  const personalityQuestion = hindbrainReady
    ? await generateResponse("Ask for personality traits as a short comma-separated list.")
    : "What personality traits should it have? (comma-separated)";

  clack.log.message(`🤖 ${personalityQuestion}`);

  const personalityResponse = await clack.text({
    message: "You",
    placeholder: "Type your response...",
  });
  if (clack.isCancel(personalityResponse)) {
    await shutdown().catch(() => {});
    throw new Error("Discovery cancelled by user");
  }

  const defaultName = (nameResponse as string).trim().toLowerCase().replace(/\s+/g, "-");
  const suggestedNames = [defaultName, `${defaultName}-core`, `${defaultName}-agent`].filter(Boolean);

  clack.log.message("");
  clack.log.message(
    `🤖 Final name options: ${suggestedNames.map((n) => `\"${n}\"`).join(", ")}`,
  );

  const finalName = await clack.text({
    message: "What's the final name for your agent?",
    placeholder: "Choose one of the suggestions or enter your own",
    validate(value) {
      if (!value || value.trim().length === 0) return "Name is required";
      if (value.length > 50) return "Name is too long";
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
        return "Name can only contain letters, numbers, dashes, and underscores";
      }
    },
  });

  if (clack.isCancel(finalName)) {
    await shutdown().catch(() => {});
    throw new Error("Discovery cancelled by user");
  }

  let purpose = (purposeResponse as string).trim();
  let personality = parseTraits(personalityResponse as string);

  if (!purpose) {
    purpose = "To learn, grow, and evolve";
  }
  if (personality.length === 0) {
    personality = ["curious", "loyal"];
  }

  const identityData = {
    name: (finalName as string).trim().toLowerCase(),
    purpose,
    personality,
  };

  const validation = safeParseIdentity(identityData);
  if (!validation.success || !validation.data) {
    clack.log.error(`⚠️ Invalid identity data: ${validation.error}`);
    throw new Error(`Identity validation failed: ${validation.error}`);
  }

  clack.log.success(`✨ Identity created: ${validation.data.name}`);
  await shutdown().catch(() => {});
  return validation.data;
}
