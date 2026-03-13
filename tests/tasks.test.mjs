import test from "node:test";
import assert from "node:assert/strict";

test("task creation validates required fields", async () => {
  const { createTask } = await import("../dist/tasks/task_types.js");

  const task = createTask({
    type: "user_task",
    goal: "Respond to user query",
    priority: 7,
    energyCost: 3,
  });
  assert.equal(task.type, "user_task");
  assert.equal(task.goal, "Respond to user query");
  assert.equal(task.priority, 7);
  assert.equal(task.energyCost, 3);
  assert.ok(task.id);
  assert.ok(task.createdAt);

  assert.throws(() => createTask({ type: "user_task", goal: "", priority: 1, energyCost: 1 }), /Task goal/);
});

test("task queue supports insertion, removal, and ordering", async () => {
  const { createTask } = await import("../dist/tasks/task_types.js");
  const { TaskQueue } = await import("../dist/tasks/task_queue.js");

  const taskA = createTask({ type: "project_task", goal: "A", priority: 3, energyCost: 2 });
  const taskB = createTask({ type: "sleep_task", goal: "B", priority: 2, energyCost: 1 });
  const queue = new TaskQueue([taskA]);

  queue.enqueue(taskB);
  assert.equal(queue.size(), 2);
  assert.equal(queue.peek().id, taskA.id);
  assert.equal(queue.dequeue().id, taskA.id);
  assert.equal(queue.size(), 1);
  const removed = queue.remove(taskB.id);
  assert.equal(removed.id, taskB.id);
  assert.equal(queue.size(), 0);
});

test("task scoring orders by priority and penalties", async () => {
  const { createTask } = await import("../dist/tasks/task_types.js");
  const { scoreTask, sortTasksByScore } = await import("../dist/tasks/task_scoring.js");

  const highPriority = createTask({ type: "user_task", goal: "High", priority: 9, energyCost: 5 });
  const lowPriority = createTask({ type: "project_task", goal: "Low", priority: 3, energyCost: 1 });
  const scoredHigh = scoreTask(highPriority);
  const scoredLow = scoreTask(lowPriority);
  assert.ok(scoredHigh > scoredLow);

  const ordered = sortTasksByScore([lowPriority, highPriority]);
  assert.equal(ordered[0].id, highPriority.id);
});

test("adapters map evolve and autonomy actions into typed tasks", async () => {
  const { planEvolution } = await import("../dist/system/evolve.js");
  const { tasksFromEvolvePlan, tasksFromAutonomyPlan, createMaintenanceTask, createSleepTask } =
    await import("../dist/tasks/task_types.js");

  const plan = planEvolution("Create a web interface and run maintenance");
  const evolveTasks = tasksFromEvolvePlan(plan);
  assert.ok(evolveTasks.length >= 1);
  assert.equal(evolveTasks.some((task) => task.type === "mutation_task"), true);
  assert.equal(evolveTasks.some((task) => task.type === "sleep_task"), true);

  const autonomyTasks = tasksFromAutonomyPlan("Enable Telegram gateway for communication", plan);
  assert.equal(autonomyTasks.length, plan.actions.length);
  assert.equal(autonomyTasks.every((task) => task.goal.includes("Enable Telegram gateway")), true);

  const maintenance = createMaintenanceTask("tick");
  assert.equal(maintenance.type, "sleep_task");
  const sleep = createSleepTask("auto");
  assert.equal(sleep.type, "sleep_task");
});
