import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("start daemon lifecycle: start -> status -> stop", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-daemon");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "daemon-seed",
      "--purpose",
      "Validate daemon lifecycle",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const start = spawnSync(
    "node",
    [
      "dist/cli.js",
      "start",
      "--daemon",
      "--daemonCommand",
      "node",
      "--daemonArgs",
      "-e setInterval(()=>{},1000)",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(start.status, 0, `${start.stdout}\n${start.stderr}`);
  assert.match(`${start.stdout}\n${start.stderr}`, /Daemon started/i);

  const statePath = path.join(testHome, ".hatchlings", "daemon-seed", "brain", "daemon_state.json");
  const state = JSON.parse(await fs.readFile(statePath, "utf-8"));
  assert.equal(typeof state.pid, "number");
  assert.equal(state.pid > 0, true);
  process.kill(state.pid, 0);

  const status = spawnSync("node", ["dist/cli.js", "start", "--daemonStatus"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(status.status, 0, `${status.stdout}\n${status.stderr}`);
  assert.match(`${status.stdout}\n${status.stderr}`, /Daemon running/i);

  const stop = spawnSync("node", ["dist/cli.js", "start", "--stopDaemon"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(stop.status, 0, `${stop.stdout}\n${stop.stderr}`);
  assert.match(`${stop.stdout}\n${stop.stderr}`, /Stopped daemon/i);

  const stateExists = await fs
    .stat(statePath)
    .then(() => true)
    .catch(() => false);
  assert.equal(stateExists, false);

  await fs.rm(testHome, { recursive: true, force: true });
});
