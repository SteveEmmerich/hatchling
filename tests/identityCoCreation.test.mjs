import test from "node:test";
import assert from "node:assert/strict";

import { inferIdentityFromNarrative, parsePersonalityInput } from "../dist/system/identity-co-creation.js";

test("inferIdentityFromNarrative extracts name, purpose, and personality from free-form input", () => {
  const inferred = inferIdentityFromNarrative(
    "Let's call it ember. It should help me plan software releases and be curious, calm, and direct.",
  );
  assert.equal(inferred.name, "ember");
  assert.match(String(inferred.purpose), /help me plan software releases/i);
  assert.deepEqual(inferred.personality, ["curious", "calm", "direct"]);
});

test("inferIdentityFromNarrative returns partial data when only purpose is provided", () => {
  const inferred = inferIdentityFromNarrative("Purpose is to assist with debugging and incident response.");
  assert.equal(inferred.name, undefined);
  assert.match(String(inferred.purpose), /assist with debugging/i);
});

test("parsePersonalityInput normalizes and deduplicates trait lists", () => {
  const traits = parsePersonalityInput("Curious and precise, curious, empathetic");
  assert.deepEqual(traits, ["curious", "precise", "empathetic"]);
});
