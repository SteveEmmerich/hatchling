import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

test("agent state files are seeded correctly", async () => {
  const { ensureAgentState } = await import("../dist/agents/agent_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-seed-"));
  process.env.HATCHLING_CONTEXT = "cli";
  const state = await ensureAgentState(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;

  const active = await readJson(path.join(tmpRoot, "brain", "agents", "active_agents.json"));
  const results = await readJson(path.join(tmpRoot, "brain", "agents", "agent_results.json"));
  const history = await readJson(path.join(tmpRoot, "brain", "agents", "agent_history.json"));

  assert.ok(Array.isArray(active.agents));
  assert.ok(Array.isArray(results.results));
  assert.ok(Array.isArray(history.agents));
  assert.equal(state.active.length, 0);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("agent manager can spawn an agent", async () => {
  const { spawnAgent, listActiveAgents } = await import("../dist/agents/agent_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-spawn-"));
  process.env.HATCHLING_CONTEXT = "cli";
  const task = await spawnAgent(tmpRoot, {
    type: "code_analyzer",
    goal: "Review structure",
    allowed_tools: ["filesystem:read"],
  });
  const active = await listActiveAgents(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;
  assert.equal(active.length, 1);
  assert.equal(active[0].id, task.id);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("agent runner executes and records result", async () => {
  const { spawnAgent, runAgent, listActiveAgents } = await import("../dist/agents/agent_manager.js");
  const { collectAgentResults } = await import("../dist/agents/agent_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-run-"));
  process.env.HATCHLING_CONTEXT = "cli";
  const task = await spawnAgent(tmpRoot, {
    type: "doc_writer",
    goal: "Write quick notes",
    allowed_tools: ["filesystem:read"],
  });
  const result = await runAgent(tmpRoot, task.id);
  const active = await listActiveAgents(tmpRoot);
  const results = await collectAgentResults(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;

  assert.ok(result);
  assert.equal(result.agentId, task.id);
  assert.equal(result.agentType, task.type);
  assert.ok(result.output.includes("Goal:"));
  assert.equal(active.length, 0);
  assert.ok(results.some((entry) => entry.agentId === task.id));
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("failed agents move to history with failure status", async () => {
  const { spawnAgent, runAgent } = await import("../dist/agents/agent_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-fail-"));
  process.env.HATCHLING_CONTEXT = "cli";
  const task = await spawnAgent(tmpRoot, {
    type: "code_analyzer",
    goal: "No file access",
    allowed_tools: [],
  });
  const result = await runAgent(tmpRoot, task.id);
  const history = await readJson(path.join(tmpRoot, "brain", "agents", "agent_history.json"));
  delete process.env.HATCHLING_CONTEXT;

  assert.ok(result);
  assert.equal(result.status, "failed");
  assert.ok(history.agents.some((entry) => entry.id === task.id && entry.status === "failed"));
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("active agent state is cleaned up after completion", async () => {
  const { spawnAgent, runAgent, listActiveAgents } = await import("../dist/agents/agent_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-clean-"));
  process.env.HATCHLING_CONTEXT = "cli";
  const task = await spawnAgent(tmpRoot, {
    type: "researcher",
    goal: "Scan README",
    allowed_tools: ["filesystem:read"],
  });
  await runAgent(tmpRoot, task.id);
  const active = await listActiveAgents(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;
  assert.equal(active.length, 0);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("malformed agent state files are repaired safely", async () => {
  const { ensureAgentState } = await import("../dist/agents/agent_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-repair-"));
  await fs.mkdir(path.join(tmpRoot, "brain", "agents"), { recursive: true });
  await fs.writeFile(path.join(tmpRoot, "brain", "agents", "active_agents.json"), "{bad", "utf-8");
  await fs.writeFile(path.join(tmpRoot, "brain", "agents", "agent_results.json"), "{bad", "utf-8");
  await fs.writeFile(path.join(tmpRoot, "brain", "agents", "agent_history.json"), "{bad", "utf-8");
  process.env.HATCHLING_CONTEXT = "cli";
  const state = await ensureAgentState(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;
  assert.equal(state.active.length, 0);
  assert.equal(state.results.length, 0);
  assert.equal(state.history.length, 0);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});
