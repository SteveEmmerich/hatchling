import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("channel bootstrap -> validate -> test-message simulated flow", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-channel");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = { ...process.env, HATCHLING_HOME: testHome, HATCHLING_HINDBRAIN_BACKEND: "cpu" };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "channel-seed",
      "--purpose",
      "Validate channel gateway flow",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const bootstrap = spawnSync("node", ["dist/cli.js", "channel", "bootstrap", "telegram"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(bootstrap.status, 0, `${bootstrap.stdout}\n${bootstrap.stderr}`);
  const sharedSkill = path.join(testHome, ".hatchlings", "channel-seed", "limbs", "channel-mcp-bridge", "SKILL.md");
  await fs.access(sharedSkill);

  const validateMissing = spawnSync(
    "node",
    ["dist/cli.js", "channel", "validate", "telegram", "--json"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.notEqual(validateMissing.status, 0, `${validateMissing.stdout}\n${validateMissing.stderr}`);
  const missing = JSON.parse(validateMissing.stdout);
  assert.equal(missing.ok, false);
  assert.equal(missing.missingEnv.includes("TELEGRAM_BOT_TOKEN"), true);

  const readyEnv = {
    ...env,
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "123",
  };
  const validateReady = spawnSync(
    "node",
    ["dist/cli.js", "channel", "validate", "telegram", "--json"],
    { cwd: process.cwd(), env: readyEnv, encoding: "utf-8" },
  );
  assert.equal(validateReady.status, 0, `${validateReady.stdout}\n${validateReady.stderr}`);
  const ready = JSON.parse(validateReady.stdout);
  assert.equal(ready.ok, true);

  const testMessage = spawnSync(
    "node",
    [
      "dist/cli.js",
      "channel",
      "test-message",
      "telegram",
      "--message",
      "hello from hatchling",
      "--json",
    ],
    { cwd: process.cwd(), env: readyEnv, encoding: "utf-8" },
  );
  assert.equal(testMessage.status, 0, `${testMessage.stdout}\n${testMessage.stderr}`);
  const delivery = JSON.parse(testMessage.stdout);
  assert.equal(delivery.ok, true);
  assert.match(delivery.outboxPath, /memory\/channels\/telegram\/outbox\.jsonl/i);

  const outboxContent = await fs.readFile(delivery.outboxPath, "utf-8");
  assert.match(outboxContent, /hello from hatchling/i);

  await fs.rm(testHome, { recursive: true, force: true });
});
