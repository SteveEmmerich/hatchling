import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("rollback reverts last evolution run actions", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-evolve-rollback");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    OPENAI_API_KEY: "test-openai-key",
  };

  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "rollback-seed",
      "--purpose",
      "Validate evolve rollback",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const evolve = spawnSync(
    "node",
    [
      "dist/cli.js",
      "evolve",
      "Enable Telegram gateway and use OpenAI",
      "--execute",
      "--json",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(evolve.status, 0, `${evolve.stdout}\n${evolve.stderr}`);

  const active = (await fs.readFile(path.join(testHome, ".hatchling_active"), "utf-8")).trim();
  const root = path.join(testHome, ".hatchlings", active);
  const telegramSkill = path.join(root, "limbs", "telegram-gateway");
  const sharedSkill = path.join(root, "limbs", "channel-mcp-bridge");
  await fs.access(telegramSkill);
  await fs.access(sharedSkill);

  const rollback = spawnSync("node", ["dist/cli.js", "rollback", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(rollback.status, 0, `${rollback.stdout}\n${rollback.stderr}`);
  const rollbackResult = JSON.parse(rollback.stdout);
  assert.equal(rollbackResult.ok, true);

  const skillExistsAfter = await fs
    .stat(telegramSkill)
    .then(() => true)
    .catch(() => false);
  assert.equal(skillExistsAfter, false);
  const sharedSkillExistsAfter = await fs
    .stat(sharedSkill)
    .then(() => true)
    .catch(() => false);
  assert.equal(sharedSkillExistsAfter, false);

  const caps = JSON.parse(await fs.readFile(path.join(root, "brain", "capabilities.json"), "utf-8"));
  assert.equal(caps.capabilities["channel.telegram"].enabled, false);

  await fs.rm(testHome, { recursive: true, force: true });
});
