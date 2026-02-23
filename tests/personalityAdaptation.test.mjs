import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("personality adaptation persists signals and traits from feedback", async () => {
  const testRoot = path.join(process.cwd(), ".tmp-test-home-personality");
  await fs.rm(testRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(testRoot, "brain"), { recursive: true });

  const {
    loadPersonalityState,
    adaptPersonalityFromFeedback,
    styleReplyForPersonality,
    personalityStatePath,
  } = await import("../dist/system/personality-adaptation.js");

  const initial = await loadPersonalityState(testRoot, ["curious", "direct"]);
  assert.equal(initial.baseTraits.includes("curious"), true);
  assert.equal(initial.signals.confidence, 5);

  const updated = await adaptPersonalityFromFeedback(testRoot, "positive", "great work, very helpful");
  assert.equal(updated.totalFeedback, 1);
  assert.equal(updated.signals.warmth > initial.signals.warmth, true);
  assert.equal(Array.isArray(updated.adaptiveTraits), true);

  const persisted = JSON.parse(await fs.readFile(personalityStatePath(testRoot), "utf-8"));
  assert.equal(persisted.totalFeedback, 1);

  const styled = styleReplyForPersonality("Acknowledged.", {
    ...updated,
    signals: { ...updated.signals, warmth: 9 },
  });
  assert.match(styled, /Happy to help\./);

  await fs.rm(testRoot, { recursive: true, force: true });
});
