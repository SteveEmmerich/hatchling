import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

async function setupRoot() {
  const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-reflection-"));
  await fs.mkdir(path.join(root, "brain"), { recursive: true });
  process.env.HATCHLING_INTERNAL_WRITE = "1";
  const { PathGuard } = await import("../dist/system/pathGuard.js");
  const { ensureMemoryState } = await import("../dist/memory/memory_manager.js");
  const { defaultPersonalityState, savePersonalityState } = await import("../dist/system/personality-adaptation.js");
  PathGuard.setRoot(root);
  await ensureMemoryState(root);
  await savePersonalityState(root, defaultPersonalityState(["curious"]));
  await fs.writeFile(
    path.join(root, "brain", "curiosity_state.json"),
    JSON.stringify({ adjustedCuriosity: 5, adjustments: [] }, null, 2),
    "utf-8",
  );
  return root;
}

test("reflection records episodic memory from completed events", async () => {
  const root = await setupRoot();
  const { reflectEvent } = await import("../dist/brain/reflection_engine.js");
  const { loadEpisodicMemory } = await import("../dist/memory/episodic_memory.js");

  await reflectEvent(root, {
    type: "task",
    outcome: "Completed lint pass",
    result: "ok",
    reward: 0.2,
  });

  const memory = await loadEpisodicMemory(root);
  assert.ok(memory.episodes.length > 0);
  const last = memory.episodes[memory.episodes.length - 1];
  assert.match(last.event, /task/i);
  assert.match(last.outcome || "", /lint/i);

  await fs.rm(root, { recursive: true, force: true });
});

test("reflection updates semantic memory when knowledge is provided", async () => {
  const root = await setupRoot();
  const { reflectEvent } = await import("../dist/brain/reflection_engine.js");
  const { getKnowledge } = await import("../dist/memory/semantic_memory.js");

  await reflectEvent(root, {
    type: "task",
    outcome: "Captured environment constraint",
    knowledge: [
      {
        key: "runtime",
        value: "node",
        confidence: 0.8,
        source: "reflection",
      },
    ],
  });

  const entry = await getKnowledge(root, "runtime");
  assert.equal(entry.value, "node");
  assert.ok(entry.confidence >= 0.7);

  await fs.rm(root, { recursive: true, force: true });
});

test("reflection updates social memory when user signals are present", async () => {
  const root = await setupRoot();
  const { reflectEvent } = await import("../dist/brain/reflection_engine.js");
  const { loadSocialMemory } = await import("../dist/memory/social_memory.js");

  await reflectEvent(root, {
    type: "task",
    outcome: "Helped user with setup",
    user: {
      id: "telegram:123",
      text: "Thanks for the help!",
      sentiment: "positive",
    },
  });

  const social = await loadSocialMemory(root);
  const profile = social.users["telegram:123"];
  assert.ok(profile);
  assert.equal(profile.interactionCount, 1);
  assert.ok(profile.trust >= 50);

  await fs.rm(root, { recursive: true, force: true });
});

test("reflection appends meaningful narrative entries", async () => {
  const root = await setupRoot();
  const { reflectEvent } = await import("../dist/brain/reflection_engine.js");

  const narrative = "Completed a major milestone in autonomy planning.";
  await reflectEvent(root, {
    type: "autonomy",
    outcome: "Autonomy run completed",
    narrative,
  });

  const content = await fs.readFile(path.join(root, "brain", "memory", "narrative.md"), "utf-8");
  assert.match(content, /major milestone/i);

  await fs.rm(root, { recursive: true, force: true });
});

test("reflection produces mutation suggestions without executing them", async () => {
  const root = await setupRoot();
  const { reflectEvent } = await import("../dist/brain/reflection_engine.js");

  const suggestion = await reflectEvent(
    root,
    {
      type: "task",
      outcome: "Failed to configure channel",
      reward: -0.6,
      allowMutationSuggestion: true,
    },
    {
      suggestMutation: async () => ({ summary: "Add a safer config validator", confidence: 0.6, reason: "Channel config failed" }),
    },
  );

  assert.equal(suggestion.mutationSuggestions.length, 1);
  assert.match(suggestion.mutationSuggestions[0].summary, /validator/i);
  const store = JSON.parse(
    await fs.readFile(path.join(root, "brain", "mutation_suggestions.json"), "utf-8"),
  );
  assert.ok(store.suggestions.length >= 1);
  assert.match(store.suggestions[0].summary, /validator/i);

  await fs.rm(root, { recursive: true, force: true });
});

test("confidence curiosity trust adjustments are conservative and bounded", async () => {
  const root = await setupRoot();
  const { reflectEvent } = await import("../dist/brain/reflection_engine.js");

  const output = await reflectEvent(root, {
    type: "task",
    outcome: "High reward outcome",
    reward: 0.9,
    user: { id: "user1", sentiment: "positive" },
  });

  assert.ok(Math.abs(output.stateAdjustments.confidenceDelta) <= 0.3);
  assert.ok(Math.abs(output.stateAdjustments.curiosityDelta) <= 0.3);
  assert.ok(Math.abs(output.stateAdjustments.trustDelta) <= 3);

  const signalFile = JSON.parse(
    await fs.readFile(path.join(root, "brain", "reflection_signals.json"), "utf-8"),
  );
  assert.ok(signalFile.signals.length >= 1);

  await fs.rm(root, { recursive: true, force: true });
});
