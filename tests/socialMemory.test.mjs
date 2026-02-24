import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("social memory tracks recurring users and inferred tone", async () => {
  const testRoot = path.join(process.cwd(), ".tmp-test-home-social-memory");
  await fs.rm(testRoot, { recursive: true, force: true });
  await fs.mkdir(testRoot, { recursive: true });

  const { updateSocialMemory, loadSocialMemory } = await import("../dist/system/social-memory.js");
  await updateSocialMemory(testRoot, "telegram", "777", "please help me");
  await updateSocialMemory(testRoot, "telegram", "777", "urgent: fix now");
  await updateSocialMemory(testRoot, "telegram", "777", "keep replies brief and quick");

  const state = await loadSocialMemory(testRoot);
  assert.equal(typeof state.users["telegram:777"], "object");
  assert.equal(state.users["telegram:777"].interactions, 3);
  assert.equal(["urgent", "direct", "friendly"].includes(state.users["telegram:777"].inferredTone), true);
  assert.equal(typeof state.users["telegram:777"].trustScore, "number");
  assert.equal(state.users["telegram:777"].relationshipStage === "new" || state.users["telegram:777"].relationshipStage === "familiar" || state.users["telegram:777"].relationshipStage === "trusted", true);
  assert.equal(state.users["telegram:777"].preferences.verbosity, "brief");
  assert.equal(state.users["telegram:777"].preferences.pace, "fast");

  const filePath = path.join(testRoot, "brain", "social_memory.json");
  const persisted = JSON.parse(await fs.readFile(filePath, "utf-8"));
  assert.equal(persisted.version, 1);

  await fs.rm(testRoot, { recursive: true, force: true });
});
