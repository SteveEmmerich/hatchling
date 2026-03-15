import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("sleep consolidates memory, reviews signals, and restores energy idempotently", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-sleep");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  process.env.HATCHLING_HOME = testHome;
  process.env.HATCHLING_INTERNAL_WRITE = "1";

  const instance = await import("../dist/system/instance.js");
  const { generateDNAFiles } = await import("../dist/system/dna-generator.js");
  const { PathGuard } = await import("../dist/system/pathGuard.js");
  const { recordEpisodeEntry } = await import("../dist/memory/memory_manager.js");
  const { loadEpisodicMemory } = await import("../dist/memory/episodic_memory.js");
  const { updateSocialMemoryEntry } = await import("../dist/memory/memory_manager.js");
  const { loadSocialMemory } = await import("../dist/memory/social_memory.js");
  const { loadPersonalityState } = await import("../dist/system/personality-adaptation.js");
  const { sleep } = await import("../dist/system/sleep.js");

  const instancePath = await instance.createInstance({
    name: "sleepy",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });

  await generateDNAFiles(path.join(instancePath, "brain"), {
    name: "sleepy",
    purpose: "Sleep consolidation test",
    personality: ["curious", "rigorous"],
  });

  PathGuard.setRoot(instancePath);

  await recordEpisodeEntry(instancePath, { event: "task: sync", outcome: "success", reward: 0.2 });
  await recordEpisodeEntry(instancePath, { event: "task: sync", outcome: "success", reward: 0.2 });
  await recordEpisodeEntry(instancePath, { event: "task: sync", outcome: "success", reward: 0.2 });
  await recordEpisodeEntry(instancePath, { event: "task: milestone", outcome: "major success", reward: 0.9 });

  await updateSocialMemoryEntry(instancePath, "user:1", { trust: 50, interactionCount: 1 });

  await fs.writeFile(
    path.join(instancePath, "brain", "reflection_signals.json"),
    JSON.stringify(
      {
        version: 1,
        signals: [
          {
            id: "sig1",
            timestamp: new Date().toISOString(),
            confidenceDelta: 1.2,
            curiosityDelta: -1.1,
            trustDelta: 4,
            userId: "user:1",
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  await fs.writeFile(
    path.join(instancePath, "brain", "mutation_suggestions.json"),
    JSON.stringify(
      {
        version: 1,
        suggestions: [
          {
            id: "mut1",
            suggestion: "Add safer config validation",
            confidence: 0.7,
            createdAt: new Date().toISOString(),
            status: "pending",
          },
          {
            id: "mut2",
            suggestion: "Add safer config validation",
            confidence: 0.6,
            createdAt: new Date().toISOString(),
            status: "pending",
          },
          {
            id: "mut3",
            suggestion: "Consider a large rewrite",
            confidence: 0.2,
            createdAt: new Date().toISOString(),
            status: "pending",
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  const beforePersonality = await loadPersonalityState(instancePath);
  const beforeConfidence = beforePersonality.signals.confidence;
  const beforeCuriosity = JSON.parse(
    await fs.readFile(path.join(instancePath, "brain", "curiosity_state.json"), "utf-8"),
  ).adjustedCuriosity;

  await sleep();

  const memory = await loadEpisodicMemory(instancePath);
  const duplicates = memory.episodes.filter((episode) => episode.event === "task: sync");
  const consolidated = duplicates.filter((episode) => episode.consolidated);
  assert.ok(consolidated.length >= 2);
  const summary = memory.episodes.find((episode) => String(episode.event).startsWith("consolidated:"));
  assert.ok(summary);

  const narrative = await fs.readFile(path.join(instancePath, "brain", "memory", "narrative.md"), "utf-8");
  assert.match(narrative, /task: milestone/i);

  const afterPersonality = await loadPersonalityState(instancePath);
  const afterConfidence = afterPersonality.signals.confidence;
  const afterCuriosity = JSON.parse(
    await fs.readFile(path.join(instancePath, "brain", "curiosity_state.json"), "utf-8"),
  ).adjustedCuriosity;
  assert.ok(Math.abs(afterConfidence - beforeConfidence) <= 0.5);
  assert.ok(Math.abs(afterCuriosity - beforeCuriosity) <= 0.5);

  const social = await loadSocialMemory(instancePath);
  assert.ok(social.users["user:1"].trust >= 50);

  const suggestions = JSON.parse(
    await fs.readFile(path.join(instancePath, "brain", "mutation_suggestions.json"), "utf-8"),
  );
  const approved = suggestions.suggestions.filter((entry) => entry.status === "approved_for_pipeline");
  const rejected = suggestions.suggestions.filter((entry) => entry.status === "rejected_for_now");
  assert.equal(approved.length, 1);
  assert.ok(rejected.length >= 2);

  const energy = JSON.parse(
    await fs.readFile(path.join(instancePath, "brain", "energy_state.json"), "utf-8"),
  );
  assert.equal(energy.level, 100);
  assert.equal(energy.lowEnergy, false);

  const exploration = JSON.parse(
    await fs.readFile(path.join(instancePath, "brain", "memory", "exploration_history.json"), "utf-8"),
  );
  assert.ok(exploration.entries.some((entry) => entry.key === "sleep-cycle"));
  assert.ok(exploration.entries.some((entry) => String(entry.key).startsWith("consolidated:")));

  const narrativeBefore = narrative;
  await sleep();
  const narrativeAfter = await fs.readFile(path.join(instancePath, "brain", "memory", "narrative.md"), "utf-8");
  assert.equal(narrativeAfter, narrativeBefore);

  await instance.deleteInstance("sleepy");
  await fs.rm(testHome, { recursive: true, force: true });
});
