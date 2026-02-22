import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("start --smoke validates active instance prerequisites", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-smoke");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  process.env.HATCHLING_HOME = testHome;
  const instance = await import("../dist/system/instance.js");

  await instance.createInstance({
    name: "smoke",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });
  await instance.setActiveInstance("smoke");

  const result = spawnSync("node", ["dist/cli.js", "start", "--smoke"], {
    cwd: process.cwd(),
    env: { ...process.env, HATCHLING_HOME: testHome },
    encoding: "utf-8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /Smoke check passed/i);

  await instance.deleteInstance("smoke");
  await fs.rm(testHome, { recursive: true, force: true });
});
