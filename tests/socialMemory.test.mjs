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

  const state = await loadSocialMemory(testRoot);
  assert.equal(typeof state.users["telegram:777"], "object");
  assert.equal(state.users["telegram:777"].interactions, 2);
  assert.equal(state.users["telegram:777"].inferredTone, "urgent");
  assert.equal(typeof state.users["telegram:777"].trustScore, "number");
  assert.equal(state.users["telegram:777"].relationshipStage === "new" || state.users["telegram:777"].relationshipStage === "familiar" || state.users["telegram:777"].relationshipStage === "trusted", true);

  const filePath = path.join(testRoot, "brain", "social_memory.json");
  const persisted = JSON.parse(await fs.readFile(filePath, "utf-8"));
  assert.equal(persisted.version, 1);

  await fs.rm(testRoot, { recursive: true, force: true });
});
