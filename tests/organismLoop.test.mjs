import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("organism loop collects tasks from adapters", async () => {
  const { planEvolution } = await import("../dist/system/evolve.js");
  const { collectCandidateTasks } = await import("../dist/organism/organism_loop.js");

  const plan = planEvolution("Create a web interface and run maintenance");
  const tasks = collectCandidateTasks({
    evolvePlans: [plan],
    maintenanceContexts: ["scheduled"],
    sleepContexts: ["auto"],
  });

  assert.ok(tasks.length >= plan.actions.length);
  assert.ok(tasks.some((task) => task.type === "mutation_task"));
  assert.ok(tasks.some((task) => task.type === "sleep_task"));
});

test("organism loop selects the highest scoring task", async () => {
  const { createTask } = await import("../dist/tasks/task_types.js");
  const { selectNextTask } = await import("../dist/organism/organism_loop.js");
  const { DEFAULT_TASK_WEIGHTS } = await import("../dist/tasks/task_scoring.js");

  const low = createTask({
    type: "project_task",
    goal: "Low priority",
    priority: 2,
    energyCost: 1,
  });
  const high = createTask({
    type: "user_task",
    goal: "High priority",
    priority: 9,
    energyCost: 3,
  });

  const selected = selectNextTask([low, high], DEFAULT_TASK_WEIGHTS);
  assert.equal(selected.id, high.id);
});

test("organism loop handles empty task queues safely", async () => {
  const { selectNextTask, exposeSelectedTask } = await import("../dist/organism/organism_loop.js");

  const selected = selectNextTask([]);
  assert.equal(selected, undefined);
  assert.equal(exposeSelectedTask(selected), "No task selected.");
});

test("exposeSelectedTask formats selected task details", async () => {
  const { createTask } = await import("../dist/tasks/task_types.js");
  const { exposeSelectedTask } = await import("../dist/organism/organism_loop.js");

  const task = createTask({
    type: "project_task",
    goal: "Validate formatting",
    priority: 6,
    energyCost: 2,
  });

  const output = exposeSelectedTask(task);
  assert.match(output, new RegExp(`Task\\s+${task.id}`));
  assert.match(output, /project_task/);
  assert.match(output, /Validate formatting/);
  assert.match(output, /score=/);
});

test("organism loop returns without altering execution paths", async () => {
  const { runOrganismTick } = await import("../dist/organism/organism_loop.js");

  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-home-organism-loop-"));
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  process.env.HATCHLING_CONTEXT = "cli";

  const result = await runOrganismTick(tmpRoot, {
    evolvePlans: [],
    autonomyPlans: [],
  });

  assert.ok(result.ranAt);
  assert.equal(result.tasksConsidered, 0);
  assert.equal(result.selectedTask, undefined);

  await fs.rm(tmpRoot, { recursive: true, force: true });
  delete process.env.HATCHLING_CONTEXT;
});

test("CLI organism command prints selected task and handles no-task case", async () => {
  const { spawnSync } = await import("node:child_process");
  const testHome = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-home-cli-organism-"));
  const instanceRoot = path.join(testHome, ".hatchlings", "cli-organism-seed");

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
      "cli-organism-seed",
      "--purpose",
      "CLI organism smoke",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const noTask = spawnSync("node", ["dist/cli.js", "organism"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(noTask.status, 0, `${noTask.stdout}\n${noTask.stderr}`);
  const combinedNoTask = `${noTask.stdout}\n${noTask.stderr}`;
  assert.match(combinedNoTask, /No task selected\./);

  const { createTask } = await import("../dist/tasks/task_types.js");
  const { runOrganismTick } = await import("../dist/organism/organism_loop.js");
  process.env.HATCHLING_CONTEXT = "cli";
  const task = createTask({
    type: "project_task",
    goal: "CLI organism test task",
    priority: 8,
    energyCost: 2,
  });
  const tick = await runOrganismTick(instanceRoot, { candidates: [task] });
  assert.ok(tick.selectedTask);
  delete process.env.HATCHLING_CONTEXT;

  const withTask = spawnSync("node", ["dist/cli.js", "organism"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(withTask.status, 0, `${withTask.stdout}\n${withTask.stderr}`);
  const combinedWithTask = `${withTask.stdout}\n${withTask.stderr}`;
  assert.match(combinedWithTask, /Task\\s+[a-f0-9-]+\\s+\\|/i);

  await fs.rm(testHome, { recursive: true, force: true });
});
