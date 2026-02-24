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
