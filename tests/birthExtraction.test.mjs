import test from "node:test";
import assert from "node:assert/strict";

test("birth extraction parses conversational seed signals", async () => {
  const { extractBirthSeed } = await import("../dist/system/birth-extraction.js");

  const seed = extractBirthSeed(
    "Hi, I'm Sam. Call you Nibble. We should build tools together like a fox. I'm curious and bold.",
  );

  assert.equal(seed.userName, "Sam");
  assert.equal(seed.organismName, "nibble");
  assert.ok(seed.collaborationGoals?.some((goal) => goal.includes("build tools")));
  assert.ok(seed.archetype?.includes("fox"));
  assert.ok(typeof seed.curiosityBaseline === "number");
});

test("birth seed merge preserves latest and combines goals", async () => {
  const { mergeBirthSeeds } = await import("../dist/system/birth-extraction.js");

  const merged = mergeBirthSeeds([
    { userName: "Sam", collaborationGoals: ["build tools"], personalityHints: ["curious"] },
    { organismName: "nibble", collaborationGoals: ["explore"], personalityHints: ["bold"] },
  ]);

  assert.equal(merged.userName, "Sam");
  assert.equal(merged.organismName, "nibble");
  assert.ok(merged.collaborationGoals?.includes("build tools"));
  assert.ok(merged.collaborationGoals?.includes("explore"));
  assert.ok(merged.personalityHints?.includes("curious"));
  assert.ok(merged.personalityHints?.includes("bold"));
});
