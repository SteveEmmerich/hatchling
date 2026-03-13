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

test("curiosity.json is created if missing", async () => {
  const { ensureCuriosityState } = await import("../dist/curiosity/curiosity_engine.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-curiosity-seed-"));
  process.env.HATCHLING_CONTEXT = "cli";
  const state = await ensureCuriosityState(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;
  const onDisk = JSON.parse(
    await fs.readFile(path.join(tmpRoot, "brain", "curiosity.json"), "utf-8"),
  );
  assert.equal(onDisk.curiosity, state.curiosity);
  assert.ok(typeof onDisk.exploration_bias === "number");
  assert.ok(typeof onDisk.learning_bias === "number");
  assert.ok(typeof onDisk.mutation_bias === "number");
  assert.ok(typeof onDisk.last_exploration === "string");
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("malformed curiosity.json is repaired safely", async () => {
  const { ensureCuriosityState } = await import("../dist/curiosity/curiosity_engine.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-curiosity-repair-"));
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  await fs.writeFile(path.join(tmpRoot, "brain", "curiosity.json"), "{not-valid-json}", "utf-8");
  process.env.HATCHLING_CONTEXT = "cli";
  const state = await ensureCuriosityState(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;
  assert.ok(state.curiosity >= 0);
  const onDisk = JSON.parse(
    await fs.readFile(path.join(tmpRoot, "brain", "curiosity.json"), "utf-8"),
  );
  assert.ok(typeof onDisk.last_exploration === "string");
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("valid curiosity.json is preserved", async () => {
  const { ensureCuriosityState } = await import("../dist/curiosity/curiosity_engine.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-curiosity-preserve-"));
  await writeCuriosityState(tmpRoot, {
    curiosity: 6,
    exploration_bias: 0.55,
    learning_bias: 0.25,
    mutation_bias: 0.2,
    last_exploration: "2026-03-11T12:00:00.000Z",
  });
  process.env.HATCHLING_CONTEXT = "cli";
  const state = await ensureCuriosityState(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;
  assert.equal(state.curiosity, 6);
  assert.equal(state.exploration_bias, 0.55);
  assert.equal(state.learning_bias, 0.25);
  assert.equal(state.mutation_bias, 0.2);
  assert.equal(state.last_exploration, "2026-03-11T12:00:00.000Z");
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

test("organism initialization still succeeds with curiosity seeding", async () => {
  const { runSelfDiscovery } = await import("../dist/system/onboard.js");
  const tempHome = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-curiosity-init-"));
  process.env.HATCHLING_HOME = tempHome;
  process.env.HATCHLING_CONTEXT = "cli";

  const instanceDir = await runSelfDiscovery({
    provider: "hindbrain",
    model: "hindbrain-1b",
    seedIdentity: {
      name: "curio-seed",
      purpose: "to learn",
      personality: ["curious"],
    },
  });

  const curiosityPath = path.join(instanceDir, "brain", "curiosity.json");
  const onDisk = JSON.parse(await fs.readFile(curiosityPath, "utf-8"));
  assert.ok(typeof onDisk.curiosity === "number");
  assert.ok(typeof onDisk.exploration_bias === "number");
  assert.ok(typeof onDisk.learning_bias === "number");
  assert.ok(typeof onDisk.mutation_bias === "number");
  assert.ok(typeof onDisk.last_exploration === "string");

  delete process.env.HATCHLING_HOME;
  delete process.env.HATCHLING_CONTEXT;
  await fs.rm(tempHome, { recursive: true, force: true });
});
