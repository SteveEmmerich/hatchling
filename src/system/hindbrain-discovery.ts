/**
 * Hindbrain Discovery - Local conversational onboarding
 * Uses internal model when available; falls back to deterministic local prompts.
 */

import { initializeHindbrain, shutdown, generateResponse } from "../brain/hindbrain.js";
import * as clack from "@clack/prompts";
import { safeParseIdentity, type Identity } from "./identity-schema.js";
import {
  inferIdentityFromNarrative,
  normalizeNameCandidate,
  parsePersonalityInput,
  suggestNameFromText,
} from "./identity-co-creation.js";

function preferPracticalPrompt(candidate: string, fallback: string): string {
  const normalized = String(candidate || "").replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  if (normalized.length > 220) return fallback;
  if (/\b(hero|villain|character|lore|story|family name|fiction)\b/i.test(normalized)) {
    return fallback;
  }
  return normalized;
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
        "Greet the user warmly. Ask one concise question that helps co-create this hatchling's identity in practical terms: short name, real-world purpose, and personality. Avoid roleplay/fantasy framing.",
      )
    : "Hi, I am your hatchling's hindbrain. Tell me who this hatchling is becoming. You can include a name, purpose, and personality.";

  clack.log.message(
    `🤖 ${preferPracticalPrompt(
      intro,
      "Hi, I am your hatchling's hindbrain. Tell me who this hatchling is becoming. You can include a short name, purpose, and personality.",
    )}`,
  );

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
      ? await generateResponse("Ask for a short practical name (1-2 words). Do not use story/fantasy framing.")
      : "What should we call this hatchling?";
    clack.log.message(
      `🤖 ${preferPracticalPrompt(nameQuestion, "What should we call this hatchling? Keep it short.")}`,
    );

    const nameResponse = await clack.text({
      message: "You",
      placeholder: "Type your response...",
    });
    if (clack.isCancel(nameResponse)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }
    const inferredName = inferIdentityFromNarrative(String(nameResponse)).name;
    draftName = inferredName || normalizeNameCandidate(String(nameResponse));
  }

  if (!draftPurpose) {
    const purposeQuestion = hindbrainReady
      ? await generateResponse(
          `Ask for a one-sentence practical purpose for an agent named "${draftName || "this hatchling"}".`,
        )
      : "What is this hatchling's purpose?";
    clack.log.message(
      `🤖 ${preferPracticalPrompt(
        purposeQuestion,
        `What is ${draftName || "this hatchling"} meant to do in real use? One sentence is enough.`,
      )}`,
    );

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
      ? await generateResponse(
          "Ask for 3-5 practical personality traits as a comma-separated list (example: curious, direct, calm).",
        )
      : "What personality traits should it have? (comma-separated)";
    clack.log.message(
      `🤖 ${preferPracticalPrompt(
        personalityQuestion,
        "What personality traits should it have? Use 3-5 comma-separated traits.",
      )}`,
    );

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

  const defaultName = normalizeNameCandidate(draftName || "")
    || suggestNameFromText(draftPurpose || "")
    || "hatchling";
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
      const revised = normalizeNameCandidate(String(next));
      if (!revised) {
        clack.log.warn("Name must include letters or numbers. Keeping current name.");
      } else {
        identityData.name = revised;
      }
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
