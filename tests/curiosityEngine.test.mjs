import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function writeCuriosityState(rootDir, state) {
  const target = path.join(rootDir, "brain", "curiosity.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

test("curiosity state loads correctly from brain/curiosity.json", async () => {
  const { loadCuriosityState } = await import("../dist/curiosity/curiosity_engine.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-curiosity-state-"));
  await writeCuriosityState(tmpRoot, {
    curiosity: 7,
    exploration_bias: 0.5,
    learning_bias: 0.3,
    mutation_bias: 0.2,
    last_exploration: "2026-03-10T12:00:00.000Z",
  });
  const state = await loadCuriosityState(tmpRoot);
  assert.equal(state.curiosity, 7);
  assert.equal(state.exploration_bias, 0.5);
  assert.equal(state.learning_bias, 0.3);
  assert.equal(state.mutation_bias, 0.2);
  assert.equal(state.last_exploration, "2026-03-10T12:00:00.000Z");
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("curiosity tasks are generated when energy is high", async () => {
  const { generateCuriosityTasks } = await import("../dist/curiosity/curiosity_engine.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-curiosity-high-"));
  await writeCuriosityState(tmpRoot, {
    curiosity: 8,
    exploration_bias: 0.5,
    learning_bias: 0.3,
    mutation_bias: 0.2,
  });
  process.env.HATCHLING_CONTEXT = "cli";
  const tasks = await generateCuriosityTasks(tmpRoot, 80, 10);
  delete process.env.HATCHLING_CONTEXT;
  assert.ok(tasks.length > 0);
  assert.ok(tasks.every((task) => task.type === "curiosity_task"));
  assert.ok(tasks.every((task) => typeof task.id === "string"));
  assert.ok(tasks.every((task) => typeof task.goal === "string"));
  assert.ok(tasks.every((task) => typeof task.priority === "number"));
  assert.ok(tasks.every((task) => typeof task.energyCost === "number"));
  assert.ok(tasks.every((task) => typeof task.minEnergyRequired === "number"));
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("curiosity tasks are suppressed when energy is low", async () => {
  const { generateCuriosityTasks } = await import("../dist/curiosity/curiosity_engine.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-curiosity-low-"));
  await writeCuriosityState(tmpRoot, {
    curiosity: 8,
    exploration_bias: 0.5,
    learning_bias: 0.3,
    mutation_bias: 0.2,
  });
  const tasks = await generateCuriosityTasks(tmpRoot, 5, 10);
  assert.equal(tasks.length, 0);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});
