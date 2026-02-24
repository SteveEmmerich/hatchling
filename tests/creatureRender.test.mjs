import test from "node:test";
import assert from "node:assert/strict";

import { renderCreature, renderCreatureAnimationFrames } from "../dist/system/creature.js";

test("creature render is deterministic for same seed and signals", () => {
  const input = {
    seed: "ember:2026-01-01",
    commitCount: 12,
    sleepCycles: 3,
    successfulMutations: 4,
    totalMutations: 5,
    curiosity: 8,
    energyLevel: "High",
    safeMode: false,
    lowEnergy: false,
  };
  const a = renderCreature(input);
  const b = renderCreature(input);
  assert.equal(a.variantId, b.variantId);
  assert.deepEqual(a.lines, b.lines);
  assert.equal(a.stage, b.stage);
  assert.equal(a.mood, b.mood);
});

test("creature render varies across different seeds", () => {
  const base = {
    commitCount: 12,
    sleepCycles: 3,
    successfulMutations: 4,
    totalMutations: 5,
    curiosity: 8,
    energyLevel: "High",
    safeMode: false,
    lowEnergy: false,
  };
  const a = renderCreature({ ...base, seed: "ember:2026-01-01" });
  const b = renderCreature({ ...base, seed: "lumen:2026-01-01" });
  assert.notEqual(a.variantId, b.variantId);
  assert.notDeepEqual(a.lines, b.lines);
});

test("creature mood responds to safe mode and low energy", () => {
  const sick = renderCreature({
    seed: "a",
    commitCount: 2,
    sleepCycles: 0,
    successfulMutations: 0,
    totalMutations: 0,
    curiosity: 5,
    energyLevel: "High",
    safeMode: true,
    lowEnergy: false,
  });
  assert.equal(sick.mood, "sick");

  const sleepy = renderCreature({
    seed: "a",
    commitCount: 2,
    sleepCycles: 0,
    successfulMutations: 0,
    totalMutations: 0,
    curiosity: 5,
    energyLevel: "Low",
    safeMode: false,
    lowEnergy: true,
  });
  assert.equal(sleepy.mood, "sleepy");
});

test("creature animation uses recent event hints for richer behavior", () => {
  const creature = renderCreature({
    seed: "a",
    commitCount: 8,
    sleepCycles: 1,
    successfulMutations: 3,
    totalMutations: 4,
    curiosity: 7,
    energyLevel: "High",
    safeMode: false,
    lowEnergy: false,
  });
  const frames = renderCreatureAnimationFrames(creature, 4, ["objective_complete"]);
  assert.equal(frames.length, 4);
  assert.equal(frames.some((frame) => frame.lines.join("\n").includes("objective complete")), true);
});
