import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

test("organic lifecycle supports feedback, vitals, and sleep cycle", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-organic");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  process.env.HATCHLING_HOME = testHome;
  process.env.HATCHLING_INTERNAL_WRITE = "1";

  const instance = await import("../dist/system/instance.js");
  const { generateDNAFiles } = await import("../dist/system/dna-generator.js");
  const { PathGuard } = await import("../dist/system/pathGuard.js");
  const { recordFeedback } = await import("../dist/system/feedback.js");
  const { getVitals } = await import("../dist/system/vitals.js");
  const { sleep } = await import("../dist/system/sleep.js");

  const instancePath = await instance.createInstance({
    name: "organic",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });

  await generateDNAFiles(path.join(instancePath, "brain"), {
    name: "organic",
    purpose: "Test organic lifecycle",
    personality: ["curious", "rigorous"],
  });

  PathGuard.setRoot(instancePath);

  const beforeCommitCount = parseInt(
    execSync("git rev-list --count HEAD", { cwd: instancePath, encoding: "utf-8" }).trim(),
    10,
  );

  const feedback = await recordFeedback("positive", "integration test");
  assert.match(feedback.message, /curiosity/i);

  const vitals = await getVitals();
  assert.match(vitals, /HATCHLING VITALS/);
  assert.match(vitals, /Creature:/);
  assert.match(vitals, /Mutations Today/);

  await sleep();

  const today = new Date().toISOString().split("T")[0];
  await fs.access(path.join(instancePath, "memory", "sleep_logs", `${today}.json`));

  const mutationState = JSON.parse(
    await fs.readFile(path.join(instancePath, "brain", "mutation_state.json"), "utf-8"),
  );
  assert.equal(mutationState.mutationsToday, 0);
  const experience = await fs.readFile(
    path.join(instancePath, "brain", "EXPERIENCE.md"),
    "utf-8",
  );
  assert.match(experience, /Sleep Cycle/);
  assert.match(experience, /Telemetry events analyzed:/);

  const afterCommitCount = parseInt(
    execSync("git rev-list --count HEAD", { cwd: instancePath, encoding: "utf-8" }).trim(),
    10,
  );
  assert.ok(afterCommitCount >= beforeCommitCount + 1);

  await instance.deleteInstance("organic");
  await fs.rm(testHome, { recursive: true, force: true });
});
