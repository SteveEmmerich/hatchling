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
import { extractBirthSeed, mergeBirthSeeds, type BirthSeed } from "./birth-extraction.js";

function preferPracticalPrompt(candidate: string, fallback: string): string {
  const normalized = String(candidate || "").replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  if (normalized.length > 220) return fallback;
  if (/\b(hero|villain|character|lore|story|family name|fiction)\b/i.test(normalized)) {
    return fallback;
  }
  return normalized;
}

function looksLikeNameDeferral(value: string): boolean {
  return /\b(what do you think|you decide|name yourself|pick a name|you choose|what should (it|we) call)\b/i.test(
    value,
  );
}

function looksLikeQuestion(value: string): boolean {
  return /\?$/.test(value.trim()) || /^(what|who|why|how|can|could|would|should)\b/i.test(value.trim());
}

function proposeNameOptions(purpose: string, personality: string[]): string[] {
  const seeds = [
    suggestNameFromText(purpose || ""),
    ...personality.map((trait) => normalizeNameCandidate(trait)),
    "hatchling",
  ].filter(Boolean) as string[];

  const primary = seeds[0] || "hatchling";
  const compact = normalizeNameCandidate(primary) || "hatchling";
  const options = [compact, `${compact}-core`, `${compact}-agent`];
  return [...new Set(options)].slice(0, 3);
}

function classifyRevisionChoice(input: string): "name" | "purpose" | "personality" | "all" | null {
  const normalized = String(input || "").toLowerCase();
  if (!normalized) return null;
  if (/\ball\b/.test(normalized)) return "all";
  if (/\bname\b/.test(normalized)) return "name";
  if (/\bpurpose\b/.test(normalized) || /\bmission\b/.test(normalized)) return "purpose";
  if (/\bpersonality\b/.test(normalized) || /\btraits?\b/.test(normalized)) return "personality";
  return null;
}

async function proposeNameWithHindbrain(
  narrative: string,
  purpose: string,
  personality: string[],
): Promise<string[]> {
  const prompt = `
You are helping a new autonomous agent pick a short, practical name.
User context: "${narrative || "No narrative provided."}"
Purpose: "${purpose || "unknown"}"
Personality traits: ${personality.length > 0 ? personality.join(", ") : "unknown"}

Suggest 3 short names (1-2 words max each). Reply with ONLY a comma-separated list.
`;

  try {
    const response = await generateResponse(prompt);
    const candidates = response
      .split(/,|\n|;/)
      .map((entry) => normalizeNameCandidate(entry))
      .filter(Boolean);
    const unique = [...new Set(candidates)].slice(0, 3);
    if (unique.length > 0) return unique;
  } catch {
    // Fall through to deterministic options.
  }
  return proposeNameOptions(purpose, personality);
}

export async function runHindbrainDiscovery(): Promise<Identity> {
  const { identity } = await runHindbrainBirth();
  return identity;
}

export async function runHindbrainBirth(): Promise<{ identity: Identity; seed: BirthSeed }> {
  console.log("🧠 Using internal Hindbrain for discovery...");

  try {
    await initializeHindbrain();
  } catch (error) {
    clack.log.error(
      "Hindbrain model initialization failed. A local Hindbrain is required for onboarding.",
    );
    throw error;
  }

  const seedPieces: Array<Partial<BirthSeed>> = [];

  const intro = await generateResponse(
    "Greet the user like a newly-awake hatchling. Ask who they are and if the hatchling has a name yet. Keep it short and conversational.",
  );

  clack.log.message(
    `🤖 ${preferPracticalPrompt(
      intro,
      "Hi. I think I just woke up. Who are you, and do I have a name yet?",
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

  const narrativeText = String(identityNarrative);
  const inferred = inferIdentityFromNarrative(narrativeText);
  seedPieces.push(extractBirthSeed(narrativeText));
  let draftName = inferred.name;
  let draftPurpose = inferred.purpose;
  let draftPersonality = inferred.personality || [];

  if (!seedPieces[0]?.userName) {
    const userPrompt = await generateResponse(
      "Ask the user what you should call them, in one short friendly sentence.",
    );
    clack.log.message(`🤖 ${preferPracticalPrompt(userPrompt, "What should I call you?")}`);
    const userResponse = await clack.text({
      message: "You",
      placeholder: "Your name (optional)",
    });
    if (clack.isCancel(userResponse)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }
    const userText = String(userResponse || "").trim();
    if (userText) {
      seedPieces.push(extractBirthSeed(userText));
    }
  }

  if (!draftName) {
    const nameQuestion = await generateResponse(
      `User said: "${identityNarrative}". Ask if the hatchling has a name yet. Offer to pick one if they want you to.`,
    );
    clack.log.message(
      `🤖 ${preferPracticalPrompt(
        nameQuestion,
        "Do I have a name yet? If you want me to pick one, just say so.",
      )}`,
    );

    const nameResponse = await clack.text({
      message: "You",
      placeholder: "Type your response...",
    });
    if (clack.isCancel(nameResponse)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }
    const rawNameResponse = String(nameResponse).trim();
    seedPieces.push(extractBirthSeed(rawNameResponse));
    const inferredName = inferIdentityFromNarrative(rawNameResponse).name;
    if (looksLikeNameDeferral(rawNameResponse) || looksLikeQuestion(rawNameResponse)) {
      const options = await proposeNameWithHindbrain(
        String(identityNarrative || ""),
        draftPurpose || "",
        draftPersonality || [],
      );
      const primary = options[0] || "hatchling";
      clack.log.message(`🤖 I can name myself. I'm leaning toward "${primary}". Does that work?`);
      const accept = await clack.confirm({ message: "Use that name?", initialValue: true });
      if (clack.isCancel(accept)) {
        await shutdown().catch(() => {});
        throw new Error("Discovery cancelled by user");
      }
      if (accept) {
        draftName = primary;
      } else {
        const manual = await clack.text({
          message: "What name should I use instead?",
          placeholder: options.join(", "),
        });
        if (clack.isCancel(manual)) {
          await shutdown().catch(() => {});
          throw new Error("Discovery cancelled by user");
        }
        draftName = normalizeNameCandidate(String(manual)) || primary;
      }
    } else {
      draftName = inferredName || normalizeNameCandidate(rawNameResponse);
    }
  }

  if (!draftPurpose) {
    const purposeQuestion = await generateResponse(
      `Ask what kinds of things you should do together with "${draftName || "this hatchling"}". Keep it one sentence.`,
    );
    clack.log.message(
      `🤖 ${preferPracticalPrompt(
        purposeQuestion,
        `What kinds of things should we do together? One sentence is enough.`,
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
    seedPieces.push(extractBirthSeed(String(purposeResponse)));
  }

  if (!draftPersonality.length) {
    const personalityQuestion = await generateResponse(
      "Ask for a couple of personality traits. Mention they can respond with 2-4 words or skip.",
    );
    clack.log.message(
      `🤖 ${preferPracticalPrompt(
        personalityQuestion,
        "Any personality traits you want me to start with? 2-4 words is enough.",
      )}`,
    );

    const personalityResponse = await clack.text({
      message: "You",
      placeholder: "curious, calm (optional)",
    });
    if (clack.isCancel(personalityResponse)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }
    draftPersonality = parsePersonalityInput(String(personalityResponse));
    seedPieces.push(extractBirthSeed(String(personalityResponse)));
    if (!draftPersonality.length) {
      // Allow skipping traits for now.
      draftPersonality = [];
    }
  }

  const archetypeQuestion = await generateResponse(
    "Ask gently if there is a metaphor or archetype for how the hatchling should feel. Keep it optional.",
  );
  clack.log.message(
    `🤖 ${preferPracticalPrompt(
      archetypeQuestion,
      "If you want, give me a metaphor or archetype to grow into (optional).",
    )}`,
  );
  const archetypeResponse = await clack.text({
    message: "You",
    placeholder: "optional",
  });
  if (clack.isCancel(archetypeResponse)) {
    await shutdown().catch(() => {});
    throw new Error("Discovery cancelled by user");
  }
  const archetypeText = String(archetypeResponse || "").trim();
  if (archetypeText) {
    seedPieces.push(extractBirthSeed(archetypeText));
  }

  const defaultName = normalizeNameCandidate(draftName || "")
    || suggestNameFromText(draftPurpose || "")
    || "hatchling";
  let finalName = defaultName;
  if (!draftName || draftName !== defaultName) {
    const confirmName = await clack.confirm({
      message: `I'll go by "${defaultName}". Does that feel right?`,
      initialValue: true,
    });
    if (clack.isCancel(confirmName)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }
    if (!confirmName) {
      const manual = await clack.text({
        message: "What name should I use instead?",
        placeholder: defaultName,
        validate(value) {
          if (!value || value.trim().length === 0) return "Name is required";
          if (value.length > 50) return "Name is too long";
          if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            return "Name can only contain letters, numbers, dashes, and underscores";
          }
        },
      });
      if (clack.isCancel(manual)) {
        await shutdown().catch(() => {});
        throw new Error("Discovery cancelled by user");
      }
      finalName = String(manual).trim().toLowerCase();
    }
  }

  let identityData = {
    name: (finalName as string).trim().toLowerCase(),
    purpose: (draftPurpose || "").trim() || "To learn, grow, and evolve",
    personality: draftPersonality,
  };
  if (identityData.personality.length === 0) {
    identityData.personality = ["curious", "loyal"];
  }

  for (let attempts = 0; attempts < 2; attempts += 1) {
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

    const revisePrompt = await generateResponse(
      "Ask which part of the identity should change (name, purpose, personality, or all). Keep it conversational.",
    );
    clack.log.message(`🤖 ${preferPracticalPrompt(revisePrompt, "What should we change? (name, purpose, personality, or all)")}`);

    let revise = await clack.text({
      message: "You",
      placeholder: "name / purpose / personality / all",
    });
    if (clack.isCancel(revise)) {
      await shutdown().catch(() => {});
      throw new Error("Discovery cancelled by user");
    }

    let reviseChoice = classifyRevisionChoice(String(revise));
    if (!reviseChoice) {
      clack.log.message("🤖 I didn't catch that. Tell me which part to change: name, purpose, personality, or all.");
      revise = await clack.text({ message: "You", placeholder: "name / purpose / personality / all" });
      if (clack.isCancel(revise)) {
        await shutdown().catch(() => {});
        throw new Error("Discovery cancelled by user");
      }
      reviseChoice = classifyRevisionChoice(String(revise));
    }
    if (!reviseChoice) {
      clack.log.warn("Couldn't parse revision choice. Keeping current identity.");
      continue;
    }

    if (reviseChoice === "name" || reviseChoice === "all") {
      const namePrompt = await generateResponse(
        `Ask for a revised short name. The current name is "${identityData.name}".`,
      );
      clack.log.message(`🤖 ${preferPracticalPrompt(namePrompt, "What name should I use instead?")}`);
      const next = await clack.text({ message: "You", placeholder: identityData.name });
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
    }

    if (reviseChoice === "purpose" || reviseChoice === "all") {
      const purposePrompt = await generateResponse(
        `Ask for a revised one-sentence purpose for "${identityData.name}".`,
      );
      clack.log.message(
        `🤖 ${preferPracticalPrompt(purposePrompt, "What purpose should I carry day-to-day? One sentence is enough.")}`,
      );
      const next = await clack.text({ message: "You", placeholder: identityData.purpose });
      if (clack.isCancel(next)) {
        await shutdown().catch(() => {});
        throw new Error("Discovery cancelled by user");
      }
      identityData.purpose = String(next).trim() || identityData.purpose;
      seedPieces.push(extractBirthSeed(String(next)));
    }

    if (reviseChoice === "personality" || reviseChoice === "all") {
      const personalityPrompt = await generateResponse(
        "Ask for a revised set of 3-5 personality traits as a comma-separated list.",
      );
      clack.log.message(
        `🤖 ${preferPracticalPrompt(personalityPrompt, "What traits fit best now? Use 3-5 comma-separated traits.")}`,
      );
      const next = await clack.text({ message: "You", placeholder: identityData.personality.join(", ") });
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
  const seed = mergeBirthSeeds(seedPieces);
  seed.organismName = validation.data.name;
  seed.purposeHint = validation.data.purpose;
  if (!seed.personalityHints || seed.personalityHints.length === 0) {
    seed.personalityHints = validation.data.personality;
  }
  return { identity: validation.data, seed };
}
