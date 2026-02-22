import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("doctor --json reports checks and succeeds in clean temp home", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-doctor");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const result = spawnSync("node", ["dist/cli.js", "doctor", "--json"], {
    cwd: process.cwd(),
    env: { ...process.env, HATCHLING_HOME: testHome, HATCHLING_HINDBRAIN_BACKEND: "cpu" },
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(typeof payload.ok, "boolean");
  assert.ok(Array.isArray(payload.checks));
  assert.ok(payload.checks.some((c) => c.key === "node_version"));
  assert.ok(payload.checks.some((c) => c.key === "hindbrain_backend"));

  await fs.rm(testHome, { recursive: true, force: true });
});

test("doctor warns when enabled channel is missing env vars", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-doctor-channel-env");
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
      "doctor-env-seed",
      "--purpose",
      "Validate doctor channel env warning",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const enableChannel = spawnSync(
    "node",
    ["dist/cli.js", "capability", "enable", "channel.telegram"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(enableChannel.status, 0, `${enableChannel.stdout}\n${enableChannel.stderr}`);

  const result = spawnSync("node", ["dist/cli.js", "doctor", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  const envCheck = payload.checks.find((c) => c.key === "channel_telegram_env");
  assert.ok(envCheck);
  assert.equal(envCheck.level, "warn");

  await fs.rm(testHome, { recursive: true, force: true });
});

test("doctor fails when channel capability is enabled but gateway limb is missing", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-doctor-channel-missing-gateway");
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
      "doctor-gateway-seed",
      "--purpose",
      "Validate doctor gateway failure",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const capsPath = path.join(testHome, ".hatchlings", "doctor-gateway-seed", "brain", "capabilities.json");
  const caps = JSON.parse(await fs.readFile(capsPath, "utf-8"));
  caps.capabilities["channel.telegram"].enabled = true;
  await fs.writeFile(capsPath, JSON.stringify(caps, null, 2), "utf-8");

  const result = spawnSync("node", ["dist/cli.js", "doctor", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  const gatewayCheck = payload.checks.find((c) => c.key === "channel_telegram_gateway");
  assert.ok(gatewayCheck);
  assert.equal(gatewayCheck.level, "fail");

  await fs.rm(testHome, { recursive: true, force: true });
});
