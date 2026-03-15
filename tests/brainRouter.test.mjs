import test from "node:test";
import assert from "node:assert/strict";

test("hindbrain interface covers onboarding and homeostasis responsibilities", async () => {
  const { createHindbrainInterface } = await import("../dist/brain/hindbrain_interface.js");

  const discovery = async () => ({
    name: "ember",
    purpose: "test",
    personality: ["curious"],
  });
  const responder = async () => "Reflection summary\n- insight one\n- insight two";
  const hindbrain = createHindbrainInterface({ responder, discovery });

  const onboard = await hindbrain.onboardIdentity({});
  assert.equal(onboard.ok, true);
  assert.equal(onboard.data.name, "ember");

  const decision = await hindbrain.decideHomeostasis({
    energy: { level: 4, sleepThreshold: 10, criticalThreshold: 5 },
    pendingTasks: 2,
  });
  assert.equal(decision.data.action, "sleep");

  const reflection = await hindbrain.reflect({ events: ["learned X"], tone: "calm" });
  assert.ok(reflection.data.summary.length > 0);
  assert.ok(reflection.data.insights.length >= 1);

  const curiosity = await hindbrain.calibrateCuriosity({
    currentCuriosity: 5,
    stress: 8,
    caution: 7,
    feedbackDelta: 1,
  });
  assert.ok(Number.isFinite(curiosity.data.adjustedCuriosity));

  const mutation = await hindbrain.suggestMutation({ goal: "add skill" });
  assert.ok(mutation.data.suggestion.length > 0);

  const sleepSummary = await hindbrain.summarizeForSleep({
    completedTasks: ["task A"],
    pendingTasks: ["task B"],
    energyLevel: 3,
  });
  assert.ok(sleepSummary.data.summary.length > 0);
});

test("forebrain interface signals availability and returns structured output", async () => {
  const { createForebrainInterface } = await import("../dist/brain/forebrain_interface.js");

  const responder = async () => "Plan:\n- Step one\n- Step two";
  const forebrain = createForebrainInterface({ responder });
  assert.equal(await forebrain.isAvailable(), true);

  const plan = await forebrain.plan({ goal: "Ship feature" });
  assert.equal(plan.ok, true);
  assert.equal(plan.data.bullets.length >= 1, true);

  const unavailable = createForebrainInterface();
  assert.equal(await unavailable.isAvailable(), false);
  const failed = await unavailable.plan({ goal: "noop" });
  assert.equal(failed.ok, false);
});

test("brain router sends onboarding and reflection to hindbrain", async () => {
  const { createBrainRouter } = await import("../dist/brain/brain_router.js");

  const calls = { onboard: 0, reflect: 0, homeostasis: 0 };
  const hindbrain = {
    kind: "hindbrain",
    onboardIdentity: async () => {
      calls.onboard += 1;
      return { ok: true, source: "hindbrain", data: { name: "nova", purpose: "test", personality: ["curious"] } };
    },
    decideHomeostasis: async () => {
      calls.homeostasis += 1;
      return { ok: true, source: "hindbrain", data: { action: "continue", urgency: "low", reason: "ok" } };
    },
    reflect: async () => {
      calls.reflect += 1;
      return { ok: true, source: "hindbrain", data: { summary: "ok", insights: [] } };
    },
    calibrateCuriosity: async () => ({ ok: true, source: "hindbrain", data: { adjustedCuriosity: 5, reason: "ok" } }),
    suggestMutation: async () => ({ ok: true, source: "hindbrain", data: { suggestion: "x", confidence: 0.5 } }),
    summarizeForSleep: async () => ({ ok: true, source: "hindbrain", data: { summary: "ok" } }),
    fallbackReasoning: async () => ({ ok: true, source: "hindbrain", data: { text: "fallback", bullets: [] } }),
  };
  const router = createBrainRouter({ hindbrain });

  await router.handleOnboarding({});
  await router.handleReflection({ events: ["e1"] });
  await router.handleHomeostasis({ energy: { level: 8, sleepThreshold: 10, criticalThreshold: 5 } });

  assert.equal(calls.onboard, 1);
  assert.equal(calls.reflect, 1);
  assert.equal(calls.homeostasis, 1);
});

test("brain router uses forebrain when available and falls back when unavailable", async () => {
  const { createBrainRouter } = await import("../dist/brain/brain_router.js");

  const calls = { forebrain: 0, fallback: 0 };
  const hindbrain = {
    kind: "hindbrain",
    onboardIdentity: async () => ({ ok: true, source: "hindbrain", data: { name: "nova", purpose: "test", personality: ["curious"] } }),
    decideHomeostasis: async () => ({ ok: true, source: "hindbrain", data: { action: "continue", urgency: "low", reason: "ok" } }),
    reflect: async () => ({ ok: true, source: "hindbrain", data: { summary: "ok", insights: [] } }),
    calibrateCuriosity: async () => ({ ok: true, source: "hindbrain", data: { adjustedCuriosity: 5, reason: "ok" } }),
    suggestMutation: async () => ({ ok: true, source: "hindbrain", data: { suggestion: "x", confidence: 0.5 } }),
    summarizeForSleep: async () => ({ ok: true, source: "hindbrain", data: { summary: "ok" } }),
    fallbackReasoning: async () => {
      calls.fallback += 1;
      return { ok: true, source: "hindbrain", data: { text: "fallback", bullets: [] } };
    },
  };
  const forebrain = {
    kind: "forebrain",
    isAvailable: async () => true,
    plan: async () => {
      calls.forebrain += 1;
      return { ok: true, source: "forebrain", data: { text: "plan", bullets: ["plan"] } };
    },
    reason: async () => {
      calls.forebrain += 1;
      return { ok: true, source: "forebrain", data: { text: "reason", bullets: ["reason"] } };
    },
    synthesize: async () => {
      calls.forebrain += 1;
      return { ok: true, source: "forebrain", data: { text: "synth", bullets: ["synth"] } };
    },
  };

  const router = createBrainRouter({ hindbrain, forebrain });
  const plan = await router.handlePlanning({ goal: "test" });
  assert.equal(plan.source, "forebrain");

  const unavailable = createBrainRouter({
    hindbrain,
    forebrain: { ...forebrain, isAvailable: async () => false },
  });
  const fallback = await unavailable.handlePlanning({ goal: "test" });
  assert.equal(fallback.source, "hindbrain");
  assert.equal(fallback.fallback, true);
  assert.equal(calls.forebrain >= 1, true);
  assert.equal(calls.fallback >= 1, true);
});

test("interactive discovery preserves seed identity behavior", async () => {
  const { runInteractiveDiscovery } = await import("../dist/system/discovery.js");

  const discovery = await runInteractiveDiscovery("hindbrain", "hindbrain-1b", {
    name: "seed",
    purpose: "seed purpose",
    personality: ["curious"],
  });

  assert.equal(discovery.identity.name, "seed");
  assert.equal(discovery.identity.purpose, "seed purpose");
  assert.equal(discovery.identity.personality[0], "curious");
  assert.equal(discovery.seed.organismName, "seed");
});
