import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("dialog state tracks sessions and follow-up planning for ambiguous requests", async () => {
  const testRoot = path.join(process.cwd(), ".tmp-test-home-dialog-state");
  await fs.rm(testRoot, { recursive: true, force: true });
  await fs.mkdir(testRoot, { recursive: true });

  const { planDialogTurn, loadDialogState } = await import("../dist/system/dialog-state.js");

  const first = await planDialogTurn(testRoot, "telegram", "777", "help", "default");
  assert.equal(typeof first.followUpQuestion, "string");
  assert.match(String(first.followUpQuestion), /exact outcome/i);
  assert.equal(first.session.turns, 1);
  assert.equal(first.progressLabel, "scoping");
  assert.match(first.nextStep, /clarify success criteria/i);

  const second = await planDialogTurn(
    testRoot,
    "telegram",
    "777",
    "Please update web dashboard to include health summaries and deploy notes.",
    "default",
  );
  assert.equal(second.session.turns, 2);
  assert.equal(second.session.openQuestion, undefined);
  assert.match(second.objectiveSummary, /web dashboard/i);
  assert.equal(["executing", "planning", "scoping", "verifying", "completed"].includes(second.progressLabel), true);
  assert.equal(typeof second.nextStep, "string");

  const persisted = await loadDialogState(testRoot);
  assert.equal(typeof persisted.sessions["telegram:777"], "object");
  assert.equal(persisted.sessions["telegram:777"].turns, 2);

  await fs.rm(testRoot, { recursive: true, force: true });
});

test("dialog state orchestrates multiple objectives and completion progression", async () => {
  const testRoot = path.join(process.cwd(), ".tmp-test-home-dialog-state-orchestration");
  await fs.rm(testRoot, { recursive: true, force: true });
  await fs.mkdir(testRoot, { recursive: true });

  const { planDialogTurn, loadDialogState } = await import("../dist/system/dialog-state.js");

  const kickoff = await planDialogTurn(
    testRoot,
    "whatsapp",
    "1555",
    "Build a web dashboard then add telegram support",
    "default",
  );
  assert.equal(kickoff.pendingObjectives >= 1, true);
  assert.equal(typeof kickoff.activeObjective, "string");

  const progress = await planDialogTurn(
    testRoot,
    "whatsapp",
    "1555",
    "Implementing the dashboard changes now",
    "default",
  );
  assert.equal(["executing", "planning", "verifying", "completed", "scoping"].includes(progress.progressLabel), true);
  assert.equal(typeof progress.nextStep, "string");

  await planDialogTurn(testRoot, "whatsapp", "1555", "done, completed the first objective", "default");
  const finalState = await loadDialogState(testRoot);
  const session = finalState.sessions["whatsapp:1555"];
  assert.equal(typeof session, "object");
  assert.equal(Array.isArray(session.objectives), true);
  assert.equal(session.objectives.some((objective) => objective.status === "completed"), true);

  await fs.rm(testRoot, { recursive: true, force: true });
});
