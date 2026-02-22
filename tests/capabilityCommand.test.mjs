import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("capability commands list and enable optional chat provider", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-capability");
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
      "cap-seed",
      "--purpose",
      "Validate capability toggles",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const listBefore = spawnSync("node", ["dist/cli.js", "capability", "list", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(listBefore.status, 0, `${listBefore.stdout}\n${listBefore.stderr}`);
  const before = JSON.parse(listBefore.stdout);
  assert.equal(before.capabilities["chat.openai"].enabled, false);

  const enable = spawnSync(
    "node",
    ["dist/cli.js", "capability", "enable", "chat.openai", "--provider", "openai", "--model", "gpt-4o-mini"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(enable.status, 0, `${enable.stdout}\n${enable.stderr}`);

  const listAfter = spawnSync("node", ["dist/cli.js", "capability", "list", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(listAfter.status, 0, `${listAfter.stdout}\n${listAfter.stderr}`);
  const after = JSON.parse(listAfter.stdout);
  assert.equal(after.capabilities["chat.openai"].enabled, true);

  const configPath = path.join(testHome, ".hatchlings", "cap-seed", "brain", "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
  assert.equal(config.provider, "openai");
  assert.equal(config.model, "gpt-4o-mini");

  await fs.rm(testHome, { recursive: true, force: true });
});

test("capability enable fails when provider readiness is missing", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-capability-missing-key");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = { ...process.env, HATCHLING_HOME: testHome, HATCHLING_HINDBRAIN_BACKEND: "cpu" };
  delete env.OPENAI_API_KEY;

  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "cap-missing-seed",
      "--purpose",
      "Validate provider readiness checks",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const enable = spawnSync(
    "node",
    ["dist/cli.js", "capability", "enable", "chat.openai"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.notEqual(enable.status, 0, `${enable.stdout}\n${enable.stderr}`);
  assert.match(`${enable.stdout}\n${enable.stderr}`, /OPENAI_API_KEY is required/i);

  const listAfter = spawnSync("node", ["dist/cli.js", "capability", "list", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(listAfter.status, 0, `${listAfter.stdout}\n${listAfter.stderr}`);
  const after = JSON.parse(listAfter.stdout);
  assert.equal(after.capabilities["chat.openai"].enabled, false);

  await fs.rm(testHome, { recursive: true, force: true });
});

test("capability enable for channel bootstraps gateway limb", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-capability-channel");
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
      "cap-channel-seed",
      "--purpose",
      "Validate channel capability bootstrap",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const enable = spawnSync(
    "node",
    ["dist/cli.js", "capability", "enable", "channel.telegram"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(enable.status, 0, `${enable.stdout}\n${enable.stderr}`);

  const skillPath = path.join(testHome, ".hatchlings", "cap-channel-seed", "limbs", "telegram-gateway", "SKILL.md");
  await fs.access(skillPath);

  const capsPath = path.join(testHome, ".hatchlings", "cap-channel-seed", "brain", "capabilities.json");
  const caps = JSON.parse(await fs.readFile(capsPath, "utf-8"));
  assert.equal(caps.capabilities["channel.telegram"].enabled, true);

  await fs.rm(testHome, { recursive: true, force: true });
});
