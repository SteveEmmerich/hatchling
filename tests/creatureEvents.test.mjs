import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("creature events persist and summarize recent activity", async () => {
  const testRoot = path.join(process.cwd(), ".tmp-test-home-creature-events");
  await fs.rm(testRoot, { recursive: true, force: true });
  await fs.mkdir(testRoot, { recursive: true });

  const { recordCreatureEvent, summarizeCreatureEvents } = await import("../dist/system/creature-events.js");
  await recordCreatureEvent(testRoot, "social_ping", "message");
  await recordCreatureEvent(testRoot, "objective_progress", "planning");
  await recordCreatureEvent(testRoot, "objective_complete", "done");

  const summary = await summarizeCreatureEvents(testRoot);
  assert.equal(summary.total, 3);
  assert.equal(summary.counts.social_ping, 1);
  assert.equal(summary.counts.objective_complete, 1);
  assert.equal(summary.recentTypes.includes("objective_complete"), true);

  await fs.rm(testRoot, { recursive: true, force: true });
});
