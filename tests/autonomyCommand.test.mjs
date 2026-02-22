import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseJsonPayload(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error(`No JSON object found in output: ${text}`);
  }
  return JSON.parse(text.slice(start));
}

test("autonomy command plans multi-step objectives in dry-run mode", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-autonomy-plan");
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
      "autonomy-plan-seed",
      "--purpose",
      "Validate autonomy planner",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const run = spawnSync(
    "node",
    [
      "dist/cli.js",
      "autonomy",
      "Enable Telegram gateway then run maintenance",
      "--maxSteps",
      "4",
      "--json",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const output = parseJsonPayload(run.stdout);
  assert.equal(output.execute, false);
  assert.equal(Array.isArray(output.steps), true);
  assert.equal(output.steps.length >= 2, true);
  assert.equal(output.steps[0].status, "planned");

  await fs.rm(testHome, { recursive: true, force: true });
});

test("autonomy command blocks risky execution when approvals are required", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-autonomy-blocked");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    ANTHROPIC_API_KEY: "test-anthropic-key",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "autonomy-blocked-seed",
      "--purpose",
      "Validate autonomy approval gate",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const run = spawnSync(
    "node",
    [
      "dist/cli.js",
      "autonomy",
      "Use Claude then run maintenance",
      "--execute",
      "--enforceApprovals",
      "--json",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.notEqual(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const output = parseJsonPayload(run.stdout);
  assert.equal(output.ok, false);
  assert.equal(output.stoppedReason, "approval_required");
  assert.equal(output.steps.some((step) => step.status === "blocked"), true);

  await fs.rm(testHome, { recursive: true, force: true });
});

test("autonomy command executes multi-step run and writes run log", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-autonomy-exec");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    ANTHROPIC_API_KEY: "test-anthropic-key",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "autonomy-exec-seed",
      "--purpose",
      "Validate autonomy execution",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const run = spawnSync(
    "node",
    [
      "dist/cli.js",
      "autonomy",
      "Use Claude then run maintenance",
      "--execute",
      "--enforceApprovals",
      "--approvePlan",
      "--json",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const output = parseJsonPayload(run.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.steps.some((step) => step.status === "executed"), true);

  const active = (await fs.readFile(path.join(testHome, ".hatchling_active"), "utf-8")).trim();
  const root = path.join(testHome, ".hatchlings", active);
  const logPath = path.join(root, "brain", "autonomy_runs.json");
  const log = JSON.parse(await fs.readFile(logPath, "utf-8"));
  assert.equal(Array.isArray(log.runs), true);
  assert.equal(log.runs.length >= 1, true);

  await fs.rm(testHome, { recursive: true, force: true });
});
