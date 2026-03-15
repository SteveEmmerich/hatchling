import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("reflection command prints a tuning snapshot", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-reflection");
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
      "reflection-seed",
      "--purpose",
      "Reflection snapshot",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const result = spawnSync("node", ["dist/cli.js", "reflection"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Reflection Tuning/);
  assert.match(result.stdout, /Adjustments/);
  assert.match(result.stdout, /Mutation suggestions/);

  await fs.rm(testHome, { recursive: true, force: true });
});

test("reflection status summarizes recent signals and suggestions", async () => {
  const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-reflection-status-"));
  process.env.HATCHLING_HOME = root;
  process.env.HATCHLING_INTERNAL_WRITE = "1";
  process.env.HATCHLING_CONTEXT = "cli";

  const { PathGuard } = await import("../dist/system/pathGuard.js");
  const { createInstance } = await import("../dist/system/instance.js");
  const { generateDNAFiles } = await import("../dist/system/dna-generator.js");
  const { getReflectionStatus, formatReflectionStatus } = await import("../dist/brain/reflection_status.js");

  PathGuard.setRoot(root);
  const instancePath = await createInstance({
    name: "reflection-status",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });
  await generateDNAFiles(path.join(instancePath, "brain"), {
    name: "reflection-status",
    purpose: "Reflection summary",
    personality: ["curious"],
  });

  await fs.mkdir(path.join(instancePath, "brain", "memory"), { recursive: true });
  await fs.writeFile(
    path.join(instancePath, "brain", "memory", "episodic_memory.json"),
    JSON.stringify(
      {
        version: 1,
        episodes: [
          {
            id: "ep1",
            timestamp: new Date().toISOString(),
            event: "task: explore_codebase",
            outcome: "Found opportunities",
            context: { taskType: "curiosity_task" },
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  await fs.writeFile(
    path.join(instancePath, "brain", "memory", "narrative.md"),
    "# Hatchling Narrative\n\nDiscovered an opportunity to improve tests.\n",
    "utf-8",
  );

  await fs.writeFile(
    path.join(instancePath, "brain", "reflection_signals.json"),
    JSON.stringify(
      {
        version: 1,
        signals: [
          {
            id: "signal1",
            timestamp: new Date().toISOString(),
            confidenceDelta: 0.2,
            curiosityDelta: -0.1,
            trustDelta: 1,
            source: "task",
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  await fs.writeFile(
    path.join(instancePath, "brain", "mutation_suggestions.json"),
    JSON.stringify(
      {
        version: 1,
        suggestions: [
          {
            id: "mut1",
            suggestion: "Add a small regression test",
            confidence: 0.7,
            createdAt: new Date().toISOString(),
            source: "task",
            status: "pending",
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  await fs.writeFile(
    path.join(instancePath, "brain", "curiosity_state.json"),
    JSON.stringify(
      {
        adjustedCuriosity: 6,
        lastCalculated: new Date().toISOString(),
        adjustments: [
          {
            timestamp: new Date().toISOString(),
            reason: "exploration reward",
            delta: 0.2,
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  await fs.mkdir(path.join(instancePath, "brain", "agents"), { recursive: true });
  await fs.writeFile(
    path.join(instancePath, "brain", "agents", "agent_results.json"),
    JSON.stringify(
      {
        results: [
          {
            id: "agent-result-1",
            agentId: "agent-1",
            agentType: "code_analyzer",
            status: "completed",
            output: "Summary line",
            result: { summary: "Audit highlights" },
            createdAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
          },
        ],
      },
      null,
      2,
    ),
    "utf-8",
  );

  const status = await getReflectionStatus(instancePath);
  const output = formatReflectionStatus(status);
  assert.match(output, /Reflection Tuning/);
  assert.match(output, /Adjustments/);
  assert.match(output, /Mutation suggestions/);
  assert.match(output, /Add a small regression test/);
  assert.match(output, /Curiosity tasks/);
  assert.match(output, /Agent follow-ups/);

  await fs.rm(root, { recursive: true, force: true });
  delete process.env.HATCHLING_HOME;
  delete process.env.HATCHLING_INTERNAL_WRITE;
  delete process.env.HATCHLING_CONTEXT;
});
