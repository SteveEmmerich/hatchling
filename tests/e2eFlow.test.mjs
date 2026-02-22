import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("non-interactive e2e flow: init -> list -> start --smoke -> doctor", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-e2e");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = { ...process.env, HATCHLING_HOME: testHome, HATCHLING_HINDBRAIN_BACKEND: "cpu" };

  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--provider",
      "hindbrain",
      "--model",
      "hindbrain-1b",
      "--name",
      "e2e-seed",
      "--purpose",
      "Validate end to end lifecycle",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const list = spawnSync("node", ["dist/cli.js", "list"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(list.status, 0, `${list.stdout}\n${list.stderr}`);
  assert.match(`${list.stdout}\n${list.stderr}`, /e2e-seed/i);

  const smoke = spawnSync("node", ["dist/cli.js", "start", "--smoke"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(smoke.status, 0, `${smoke.stdout}\n${smoke.stderr}`);
  assert.match(`${smoke.stdout}\n${smoke.stderr}`, /Smoke check passed/i);

  const doctor = spawnSync("node", ["dist/cli.js", "doctor", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(doctor.status, 0, `${doctor.stdout}\n${doctor.stderr}`);
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.ok, true);

  await fs.rm(testHome, { recursive: true, force: true });
});
