import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function setupRoot() {
  const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-traits-"));
  await fs.mkdir(path.join(root, "brain"), { recursive: true });
  process.env.HATCHLING_INTERNAL_WRITE = "1";
  const { PathGuard } = await import("../dist/system/pathGuard.js");
  const { generateDNAFiles } = await import("../dist/system/dna-generator.js");
  const { createInstance } = await import("../dist/system/instance.js");
  PathGuard.setRoot(root);
  const instancePath = await createInstance({ name: "traits", provider: "hindbrain", model: "hindbrain-1b" });
  await generateDNAFiles(path.join(instancePath, "brain"), {
    name: "traits",
    purpose: "Trait seed test",
    personality: ["curious", "direct"],
  });
  return instancePath;
}

test("traits habits and self-model are seeded and repaired safely", async () => {
  const root = await setupRoot();
  const { ensureTraitState } = await import("../dist/organism/behavior_context.js");

  await ensureTraitState(root);
  const traits = JSON.parse(await fs.readFile(path.join(root, "brain", "dna", "traits.json"), "utf-8"));
  const habits = JSON.parse(await fs.readFile(path.join(root, "brain", "dna", "habits.json"), "utf-8"));
  const selfModel = JSON.parse(await fs.readFile(path.join(root, "brain", "self", "self_model.json"), "utf-8"));
  assert.equal(traits.version, 1);
  assert.equal(habits.version, 1);
  assert.equal(selfModel.version, 1);

  await fs.writeFile(path.join(root, "brain", "dna", "traits.json"), "{bad json", "utf-8");
  await ensureTraitState(root);
  const repaired = JSON.parse(await fs.readFile(path.join(root, "brain", "dna", "traits.json"), "utf-8"));
  assert.equal(repaired.version, 1);
  assert.ok(repaired.traits);

  await fs.rm(root, { recursive: true, force: true });
});

test("task scoring weights shift in bounded ways based on trait state", async () => {
  const root = await setupRoot();
  const { deriveTaskWeightsFromTraits } = await import("../dist/organism/behavior_context.js");
  const { DEFAULT_TASK_WEIGHTS } = await import("../dist/tasks/task_scoring.js");

  const weights = deriveTaskWeightsFromTraits(
    {
      curiosity: 9,
      confidence: 3,
      trust: 40,
      planningDepth: 7,
      riskTolerance: 2,
      toolBias: 5,
      reflectionFrequency: 5,
    },
    { version: 1, habits: [{ key: "favor_curiosity", weight: 0.8 }] },
    {
      version: 1,
      identity: { name: "traits", purpose: "test", personality: ["curious"] },
      strengths: ["planning"],
      weaknesses: [],
      preferences: { planningStyle: "plan-first", riskPosture: "balanced", toolPreference: "balanced" },
      updatedAt: new Date().toISOString(),
    },
  );

  assert.ok(Math.abs(weights.curiosityBonus - DEFAULT_TASK_WEIGHTS.curiosityBonus) <= 0.7);
  assert.ok(Math.abs(weights.mutationPenalty - DEFAULT_TASK_WEIGHTS.mutationPenalty) <= 0.6);
  assert.ok(Math.abs(weights.sleepBoost - DEFAULT_TASK_WEIGHTS.sleepBoost) <= 0.6);

  await fs.rm(root, { recursive: true, force: true });
});

test("behavior context remains stable when trait state is minimal", async () => {
  const root = await setupRoot();
  const { loadBehaviorContext } = await import("../dist/organism/behavior_context.js");
  const { DEFAULT_TASK_WEIGHTS } = await import("../dist/tasks/task_scoring.js");

  const context = await loadBehaviorContext(root);
  assert.deepEqual(context.taskWeights, DEFAULT_TASK_WEIGHTS);
  assert.equal(context.interactionStyle.askMode, "balanced");
  assert.equal(context.interactionStyle.caution, "balanced");
  assert.equal(context.decisionPosture.planning, "balanced");

  await fs.rm(root, { recursive: true, force: true });
});

test("habits and self-model influence candidate task generation and strategy preference", async () => {
  const root = await setupRoot();
  const { loadBehaviorContext, deriveStrategyPreference } = await import("../dist/organism/behavior_context.js");
  const { generateCuriosityTasks } = await import("../dist/curiosity/curiosity_engine.js");

  await fs.writeFile(
    path.join(root, "brain", "dna", "habits.json"),
    JSON.stringify({ version: 1, habits: [{ key: "favor_curiosity", weight: 0.9 }] }, null, 2),
    "utf-8",
  );
  await fs.writeFile(
    path.join(root, "brain", "self", "self_model.json"),
    JSON.stringify(
      {
        version: 1,
        identity: { name: "traits", purpose: "test", personality: ["curious"] },
        strengths: ["planning"],
        weaknesses: [],
        preferences: { planningStyle: "plan-first", riskPosture: "balanced", toolPreference: "balanced" },
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );

  const context = await loadBehaviorContext(root);
  const tasks = await generateCuriosityTasks(root, 100, 10, { behaviorContext: context });
  assert.ok(tasks.length > 0);
  assert.ok(tasks.some((task) => task.priority >= 5));

  const preference = deriveStrategyPreference(context.traits.traits, context.selfModel);
  assert.equal(preference, "plan-first");
  assert.ok(["ask_more_questions", "balanced", "act_directly"].includes(context.interactionStyle.askMode));

  await fs.rm(root, { recursive: true, force: true });
});

test("interaction posture shifts with confidence and curiosity within bounds", async () => {
  const root = await setupRoot();
  const { loadBehaviorContext } = await import("../dist/organism/behavior_context.js");

  await fs.writeFile(
    path.join(root, "brain", "dna", "traits.json"),
    JSON.stringify(
      {
        version: 1,
        traits: {
          curiosity: 1,
          confidence: 8,
          trust: 70,
          planningDepth: 6,
          riskTolerance: 8,
          toolBias: 6,
          reflectionFrequency: 4,
        },
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );

  const highContext = await loadBehaviorContext(root);
  assert.equal(highContext.interactionStyle.caution, "confident");
  assert.equal(highContext.interactionStyle.askMode, "act_directly");

  await fs.writeFile(
    path.join(root, "brain", "dna", "traits.json"),
    JSON.stringify(
      {
        version: 1,
        traits: {
          curiosity: 9,
          confidence: 2,
          trust: 35,
          planningDepth: 4,
          riskTolerance: 2,
          toolBias: 4,
          reflectionFrequency: 6,
        },
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );

  const lowContext = await loadBehaviorContext(root);
  assert.equal(lowContext.interactionStyle.caution, "cautious");
  assert.equal(lowContext.interactionStyle.askMode, "ask_more_questions");

  await fs.rm(root, { recursive: true, force: true });
});
