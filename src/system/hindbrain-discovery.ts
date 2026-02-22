/**
 * Hindbrain Discovery - Local conversational onboarding
 * Uses internal model when available; falls back to deterministic local prompts.
 */

import { initializeHindbrain, shutdown, generateResponse } from "../brain/hindbrain.js";
import * as clack from "@clack/prompts";
import { safeParseIdentity, type Identity } from "./identity-schema.js";
import { inferIdentityFromNarrative, parsePersonalityInput } from "./identity-co-creation.js";

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
        "Greet the user warmly. Ask them to describe who this hatchling is becoming, including name, purpose, and personality if possible. Keep it conversational.",
      )
    : "Hi, I am your hatchling's hindbrain. Tell me who this hatchling is becoming. You can include a name, purpose, and personality.";

  clack.log.message(`🤖 ${intro}`);

  const identityNarrative = await clack.text({
    message: "You",
    placeholder: "Type your response...",
  });
  if (clack.isCancel(identityNarrative)) {
    await shutdown().catch(() => {});
    throw new Error("Discovery cancelled by user");
  }

  const inferred = inferIdentityFromNarrative(String(identityNarrative));
  let draftName = inferred.name;
  let draftPurpose = inferred.purpose;
  let draftPersonality = inferred.personality || [];

  if (!draftName) {
    const nameQuestion = hindbrainReady
      ? await generateResponse("Ask for a concise agent name. Keep it warm and collaborative.")
      : "What should we call this hatchling?";
    clack.log.message(`🤖 ${nameQuestion}`);

    const nameResponse = await clack.text({
      message: "You",
      placeholder: "Type your response...",
    });
    if (clack.isCancel(nameResponse)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }
    const inferredName = inferIdentityFromNarrative(String(nameResponse)).name;
    draftName = inferredName || String(nameResponse).trim().toLowerCase().replace(/\s+/g, "-");
  }

  if (!draftPurpose) {
    const purposeQuestion = hindbrainReady
      ? await generateResponse(
          `Ask about the purpose of an agent named "${draftName || "this hatchling"}". Sound collaborative.`,
        )
      : "What is this hatchling's purpose?";
    clack.log.message(`🤖 ${purposeQuestion}`);

    const purposeResponse = await clack.text({
      message: "You",
      placeholder: "Type your response...",
    });
    if (clack.isCancel(purposeResponse)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }
    draftPurpose = inferIdentityFromNarrative(String(purposeResponse)).purpose
      || String(purposeResponse).trim();
  }

  if (!draftPersonality.length) {
    const personalityQuestion = hindbrainReady
      ? await generateResponse("Ask for personality traits as a short comma-separated list. Sound encouraging.")
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
    draftPersonality = parsePersonalityInput(String(personalityResponse));
  }

  const defaultName = (draftName || "hatchling").trim().toLowerCase().replace(/\s+/g, "-");
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

  let identityData = {
    name: (finalName as string).trim().toLowerCase(),
    purpose: (draftPurpose || "").trim() || "To learn, grow, and evolve",
    personality: draftPersonality,
  };
  if (identityData.personality.length === 0) {
    identityData.personality = ["curious", "loyal"];
  }

  while (true) {
    clack.log.message("");
    clack.log.message("🤖 Let's confirm who this hatchling is:");
    clack.log.message(`   Name: ${identityData.name}`);
    clack.log.message(`   Purpose: ${identityData.purpose}`);
    clack.log.message(`   Personality: ${identityData.personality.join(", ")}`);

    const confirmed = await clack.confirm({
      message: "Does this identity feel right?",
      initialValue: true,
    });
    if (clack.isCancel(confirmed)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }
    if (confirmed) break;

    const revise = await clack.select({
      message: "What should we revise?",
      options: [
        { value: "name", label: "Name" },
        { value: "purpose", label: "Purpose" },
        { value: "personality", label: "Personality" },
      ],
    });
    if (clack.isCancel(revise)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }

    if (revise === "name") {
      const next = await clack.text({
        message: "Enter revised name",
        placeholder: identityData.name,
      });
      if (clack.isCancel(next)) {
        await shutdown().catch(() => {});
        throw new Error("Discovery cancelled by user");
      }
      identityData.name = String(next).trim().toLowerCase();
    } else if (revise === "purpose") {
      const next = await clack.text({
        message: "Enter revised purpose",
        placeholder: identityData.purpose,
      });
      if (clack.isCancel(next)) {
        await shutdown().catch(() => {});
        throw new Error("Discovery cancelled by user");
      }
      identityData.purpose = String(next).trim() || identityData.purpose;
    } else {
      const next = await clack.text({
        message: "Enter revised personality traits (comma-separated)",
        placeholder: identityData.personality.join(","),
      });
      if (clack.isCancel(next)) {
        await shutdown().catch(() => {});
        throw new Error("Discovery cancelled by user");
      }
      const parsed = parsePersonalityInput(String(next));
      if (parsed.length > 0) {
        identityData.personality = parsed;
      }
    }
  }

  const validation = safeParseIdentity(identityData);
  if (!validation.success || !validation.data) {
    clack.log.error(`⚠️ Invalid identity data: ${validation.error}`);
    throw new Error(`Identity validation failed: ${validation.error}`);
  }

  clack.log.success(`✨ Identity created: ${validation.data.name}`);
  await shutdown().catch(() => {});
  return validation.data;
}
