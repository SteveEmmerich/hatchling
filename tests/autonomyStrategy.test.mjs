import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseJsonPayload(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  if (start === -1) {
    throw new Error(`No JSON payload found: ${text}`);
  }
  return JSON.parse(text.slice(start));
}

test("autonomy strategy persists blocked goals and reprioritizes them across runs", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-autonomy-strategy");
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
      "autonomy-strategy-seed",
      "--purpose",
      "Validate autonomy cross-session strategy",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const firstRun = spawnSync(
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
  assert.notEqual(firstRun.status, 0, `${firstRun.stdout}\n${firstRun.stderr}`);
  const firstPayload = parseJsonPayload(firstRun.stdout);
  assert.equal(firstPayload.stoppedReason, "approval_required");
  assert.equal(firstPayload.steps.some((step) => step.status === "blocked"), true);
  assert.equal(Array.isArray(firstPayload.strategyGeneratedObjectives), true);
  assert.equal(firstPayload.strategyGeneratedObjectives.length >= 1, true);

  const secondRun = spawnSync(
    "node",
    [
      "dist/cli.js",
      "autonomy",
      "run maintenance",
      "--json",
      "--maxSteps",
      "1",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(secondRun.status, 0, `${secondRun.stdout}\n${secondRun.stderr}`);
  const secondPayload = parseJsonPayload(secondRun.stdout);
  assert.equal(secondPayload.steps.length, 1);
  assert.match(String(secondPayload.steps[0].objective), /Use Claude/i);

  const instanceRoot = path.join(testHome, ".hatchlings", "autonomy-strategy-seed");
  const strategyPath = path.join(instanceRoot, "brain", "autonomy_strategy.json");
  const strategy = JSON.parse(await fs.readFile(strategyPath, "utf-8"));
  const claudeGoal = strategy.goals.find((entry) => /use claude/i.test(String(entry.objective)));
  assert.ok(claudeGoal);
  assert.equal(claudeGoal.status, "pending");
  assert.equal(claudeGoal.priority > 1, true);
  const synthesized = strategy.goals.find((entry) => /audit autonomy backlog priorities/i.test(String(entry.objective)));
  assert.ok(synthesized);

  const reflectionsPath = path.join(instanceRoot, "brain", "autonomy_reflections.md");
  const reflections = await fs.readFile(reflectionsPath, "utf-8");
  assert.match(reflections, /approval_required/i);

  await fs.rm(testHome, { recursive: true, force: true });
});
