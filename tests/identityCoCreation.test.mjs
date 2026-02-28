import test from "node:test";
import assert from "node:assert/strict";

import {
  inferIdentityFromNarrative,
  normalizeNameCandidate,
  parsePersonalityInput,
  suggestNameFromText,
} from "../dist/system/identity-co-creation.js";

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

test("inferIdentityFromNarrative does not infer a literal noisy name from purpose-like text", () => {
  const inferred = inferIdentityFromNarrative("to be $#@! useful");
  assert.equal(inferred.name, undefined);
  assert.equal(inferred.purpose, "To be useful");
});

test("normalizeNameCandidate removes noise and stop words", () => {
  assert.equal(normalizeNameCandidate("to be $#@! useful"), "useful");
  assert.equal(normalizeNameCandidate("  Name it   Ember Core  "), "ember-core");
});

test("suggestNameFromText derives compact practical name seeds", () => {
  assert.equal(suggestNameFromText("To help with incident response and release coordination"), "incident-response-release");
});
