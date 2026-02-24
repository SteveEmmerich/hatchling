import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("dna generation preserves instance config metadata and seeds state files", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-dna");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  process.env.HATCHLING_HOME = testHome;
  const instance = await import("../dist/system/instance.js");
  const { generateDNAFiles } = await import("../dist/system/dna-generator.js");

  const instancePath = await instance.createInstance({
    name: "dna",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });

  await generateDNAFiles(path.join(instancePath, "brain"), {
    name: "dna",
    purpose: "Verify config continuity",
    personality: ["curious"],
  });

  const config = JSON.parse(
    await fs.readFile(path.join(instancePath, "brain", "config.json"), "utf-8"),
  );
  assert.equal(config.name, "dna");
  assert.equal(config.provider, "hindbrain");
  assert.equal(config.model, "hindbrain-1b");
  assert.ok(config.createdAt);
  assert.ok(config.lastActive);
  assert.equal(config.agentName, "dna");

  for (const file of [
    "mutation_state.json",
    "curiosity_state.json",
    "personality_state.json",
    "social_memory.json",
    "quotas.json",
    "EVOLUTION_LOG.json",
    "channel_policy.json",
  ]) {
    await fs.access(path.join(instancePath, "brain", file));
  }

  await instance.deleteInstance("dna");
  await fs.rm(testHome, { recursive: true, force: true });
});
