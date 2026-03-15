import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function setupWorkspace() {
  const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-useful-"));
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "tests"), { recursive: true });
  await fs.mkdir(path.join(root, "brain"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "main.ts"), "export const value = 1;\n", "utf-8");
  await fs.writeFile(path.join(root, "tests", "main.test.mjs"), "import test from 'node:test';\nimport assert from 'node:assert/strict';\n test('ok', () => assert.equal(1,1));\n", "utf-8");
  await fs.writeFile(path.join(root, "README.md"), "# Sample\n## Usage\n", "utf-8");
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "sample", version: "0.0.1" }, null, 2),
    "utf-8",
  );
  return root;
}

test("code_analyzer returns structured observations for a sample code area", async () => {
  const root = await setupWorkspace();
  const { ensureAgentState, spawnAgent, runAgent } = await import("../dist/agents/agent_manager.js");
  process.env.HATCHLING_CONTEXT = "cli";
  await ensureAgentState(root);
  const task = await spawnAgent(root, {
    type: "code_analyzer",
    goal: "Review path: src",
    allowed_tools: ["filesystem:read"],
  });
  const result = await runAgent(root, task.id);
  delete process.env.HATCHLING_CONTEXT;
  assert.equal(result.status, "completed");
  assert.ok(result.result?.findings?.length >= 1);
  assert.ok(result.result?.summary);
  await fs.rm(root, { recursive: true, force: true });
});

test("researcher returns structured findings from local project context", async () => {
  const root = await setupWorkspace();
  const { ensureAgentState, spawnAgent, runAgent } = await import("../dist/agents/agent_manager.js");
  process.env.HATCHLING_CONTEXT = "cli";
  await ensureAgentState(root);
  const task = await spawnAgent(root, {
    type: "researcher",
    goal: "Summarize README",
    allowed_tools: ["filesystem:read"],
  });
  const result = await runAgent(root, task.id);
  delete process.env.HATCHLING_CONTEXT;
  assert.equal(result.status, "completed");
  assert.ok(result.result?.findings?.length >= 1);
  await fs.rm(root, { recursive: true, force: true });
});

test("test_runner executes bounded tests and records structured results", async () => {
  const root = await setupWorkspace();
  const { ensureAgentState, spawnAgent, runAgent } = await import("../dist/agents/agent_manager.js");
  process.env.HATCHLING_CONTEXT = "cli";
  await ensureAgentState(root);
  const task = await spawnAgent(root, {
    type: "test_runner",
    goal: "Run quick tests",
    allowed_tools: ["filesystem:read", "process:exec"],
    time_limit: 15000,
  });
  const result = await runAgent(root, task.id);
  delete process.env.HATCHLING_CONTEXT;
  assert.ok(["completed", "failed"].includes(result.status));
  assert.ok(result.result?.summary);
  await fs.rm(root, { recursive: true, force: true });
});

test("agent failure returns structured failure results", async () => {
  const root = await setupWorkspace();
  const { ensureAgentState, spawnAgent, runAgent } = await import("../dist/agents/agent_manager.js");
  process.env.HATCHLING_CONTEXT = "cli";
  await ensureAgentState(root);
  const task = await spawnAgent(root, {
    type: "test_runner",
    goal: "Run tests without exec",
    allowed_tools: ["filesystem:read"],
  });
  const result = await runAgent(root, task.id);
  delete process.env.HATCHLING_CONTEXT;
  assert.equal(result.status, "failed");
  assert.ok(result.result?.summary);
  await fs.rm(root, { recursive: true, force: true });
});
