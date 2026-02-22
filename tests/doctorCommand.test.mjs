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
