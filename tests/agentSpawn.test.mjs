import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function writeQuotas(rootDir, today, maxPerDay) {
  const target = path.join(rootDir, "brain", "quotas.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify({ tokens: { today, maxPerDay } }, null, 2), "utf-8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf-8"));
}

test("organism loop spawns an agent under safe conditions", async () => {
  const { createTask } = await import("../dist/tasks/task_types.js");
  const { runOrganismTick } = await import("../dist/organism/organism_loop.js");

  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-spawn-loop-"));
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  await writeQuotas(tmpRoot, 0, 100);
  process.env.HATCHLING_CONTEXT = "cli";

  const task = createTask({
    type: "curiosity_task",
    goal: "explore_codebase: inspect structure",
    priority: 5,
    energyCost: 3,
  });
  await runOrganismTick(tmpRoot, { candidates: [task], includeCuriosity: false });

  const active = await readJson(path.join(tmpRoot, "brain", "agents", "active_agents.json"));
  const spawns = await readJson(path.join(tmpRoot, "brain", "agents", "agent_spawn_log.json"));
  delete process.env.HATCHLING_CONTEXT;

  assert.equal(active.agents.length, 1);
  assert.equal(spawns.entries.length, 1);
  assert.match(spawns.entries[0].reason, /curiosity/);

  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("low energy blocks autonomous agent spawning", async () => {
  const { createTask } = await import("../dist/tasks/task_types.js");
  const { runOrganismTick } = await import("../dist/organism/organism_loop.js");

  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-spawn-low-"));
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  await writeQuotas(tmpRoot, 90, 100);
  process.env.HATCHLING_CONTEXT = "cli";

  const task = createTask({
    type: "curiosity_task",
    goal: "explore_codebase: inspect structure",
    priority: 5,
    energyCost: 3,
  });
  await runOrganismTick(tmpRoot, { candidates: [task], includeCuriosity: false });

  const active = await readJson(path.join(tmpRoot, "brain", "agents", "active_agents.json"));
  delete process.env.HATCHLING_CONTEXT;

  assert.equal(active.agents.length, 0);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("urgent user task suppresses autonomous spawning", async () => {
  const { createTask } = await import("../dist/tasks/task_types.js");
  const { runOrganismTick } = await import("../dist/organism/organism_loop.js");

  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-spawn-urgent-"));
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  await writeQuotas(tmpRoot, 0, 100);
  process.env.HATCHLING_CONTEXT = "cli";

  const urgent = createTask({
    type: "user_task",
    goal: "Answer user",
    priority: 9,
    energyCost: 2,
  });
  const curiosity = createTask({
    type: "curiosity_task",
    goal: "explore_codebase: inspect structure",
    priority: 5,
    energyCost: 3,
  });
  await runOrganismTick(tmpRoot, { candidates: [urgent, curiosity], includeCuriosity: false });

  const active = await readJson(path.join(tmpRoot, "brain", "agents", "active_agents.json"));
  delete process.env.HATCHLING_CONTEXT;

  assert.equal(active.agents.length, 0);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("duplicate agent spawn prevention works", async () => {
  const { createTask } = await import("../dist/tasks/task_types.js");
  const { runOrganismTick } = await import("../dist/organism/organism_loop.js");

  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-spawn-dup-"));
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  await writeQuotas(tmpRoot, 0, 100);
  process.env.HATCHLING_CONTEXT = "cli";

  const task = createTask({
    type: "curiosity_task",
    goal: "explore_codebase: inspect structure",
    priority: 5,
    energyCost: 3,
  });
  await runOrganismTick(tmpRoot, { candidates: [task], includeCuriosity: false });
  await runOrganismTick(tmpRoot, { candidates: [task], includeCuriosity: false });

  const active = await readJson(path.join(tmpRoot, "brain", "agents", "active_agents.json"));
  const spawns = await readJson(path.join(tmpRoot, "brain", "agents", "agent_spawn_log.json"));
  delete process.env.HATCHLING_CONTEXT;

  assert.equal(active.agents.length, 1);
  assert.equal(spawns.entries.length, 1);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("active-agent limits are enforced", async () => {
  const { createAgentTask } = await import("../dist/agents/agent_types.js");
  const { runOrganismTick } = await import("../dist/organism/organism_loop.js");
  const { createTask } = await import("../dist/tasks/task_types.js");

  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-agent-spawn-limit-"));
  await fs.mkdir(path.join(tmpRoot, "brain", "agents"), { recursive: true });
  await writeQuotas(tmpRoot, 0, 100);
  process.env.HATCHLING_CONTEXT = "cli";

  const agentA = createAgentTask({ type: "researcher", goal: "Scan README", allowed_tools: [] });
  const agentB = createAgentTask({ type: "code_analyzer", goal: "Inspect code", allowed_tools: [] });
  await fs.writeFile(
    path.join(tmpRoot, "brain", "agents", "active_agents.json"),
    JSON.stringify({ agents: [agentA, agentB] }, null, 2),
    "utf-8",
  );
  await fs.writeFile(path.join(tmpRoot, "brain", "agents", "agent_results.json"), JSON.stringify({ results: [] }, null, 2), "utf-8");
  await fs.writeFile(path.join(tmpRoot, "brain", "agents", "agent_history.json"), JSON.stringify({ agents: [] }, null, 2), "utf-8");
  await fs.writeFile(path.join(tmpRoot, "brain", "agents", "agent_spawn_log.json"), JSON.stringify({ entries: [] }, null, 2), "utf-8");

  const task = createTask({
    type: "curiosity_task",
    goal: "explore_codebase: inspect structure",
    priority: 5,
    energyCost: 3,
  });
  await runOrganismTick(tmpRoot, { candidates: [task], includeCuriosity: false, maxAgents: 2 });

  const active = await readJson(path.join(tmpRoot, "brain", "agents", "active_agents.json"));
  delete process.env.HATCHLING_CONTEXT;

  assert.equal(active.agents.length, 2);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});
