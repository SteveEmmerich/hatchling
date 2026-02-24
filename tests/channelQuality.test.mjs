import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("channel quality uses fallback shaping when provider response is unavailable", async () => {
  const testRoot = path.join(process.cwd(), ".tmp-test-home-channel-quality-fallback");
  await fs.rm(testRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(testRoot, "brain"), { recursive: true });
  await fs.writeFile(
    path.join(testRoot, "brain", "config.json"),
    JSON.stringify({ provider: "hindbrain", model: "hindbrain-1b" }, null, 2),
    "utf-8",
  );

  const { generateQualityReply } = await import("../dist/system/channel-quality.js");
  const result = await generateQualityReply(testRoot, {
    channel: "telegram",
    sender: "u1",
    inboundText: "thanks please help",
    routeName: "help",
    baseReply: "I can help with that.",
    personality: {
      version: 1,
      baseTraits: ["curious"],
      adaptiveTraits: [],
      signals: { confidence: 5, caution: 4, warmth: 8, stress: 2 },
      totalFeedback: 1,
      lastUpdatedAt: new Date().toISOString(),
      adjustments: [],
    },
    socialProfile: {
      id: "telegram:u1",
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      channels: ["telegram"],
      interactions: 3,
      inferredTone: "friendly",
      trustScore: 62,
      relationshipStage: "familiar",
      positiveSignals: 1,
      negativeSignals: 0,
      preferences: { verbosity: "balanced", pace: "normal" },
      notes: [],
    },
  });
  assert.equal(result.mode, "fallback");
  assert.match(result.text, /Good to hear from you again\./);

  await fs.rm(testRoot, { recursive: true, force: true });
});

test("channel quality uses openai rewrite when configured and available", async () => {
  const testRoot = path.join(process.cwd(), ".tmp-test-home-channel-quality-openai");
  await fs.rm(testRoot, { recursive: true, force: true });
  await fs.mkdir(path.join(testRoot, "brain"), { recursive: true });
  await fs.writeFile(
    path.join(testRoot, "brain", "config.json"),
    JSON.stringify({ provider: "openai", model: "gpt-4o-mini" }, null, 2),
    "utf-8",
  );
  process.env.OPENAI_API_KEY = "test-key";

  const { generateQualityReply } = await import("../dist/system/channel-quality.js");
  const calls = [];
  const fakeFetch = async (url, initReq) => {
    calls.push({ url: String(url), initReq });
    return {
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: "Refined response from model." } }],
        };
      },
      async text() {
        return "";
      },
    };
  };

  const result = await generateQualityReply(
    testRoot,
    {
      channel: "telegram",
      sender: "u1",
      inboundText: "help me with deploy",
      routeName: "help",
      baseReply: "I can help with that.",
      personality: {
        version: 1,
        baseTraits: ["curious"],
        adaptiveTraits: [],
        signals: { confidence: 5, caution: 4, warmth: 5, stress: 3 },
        totalFeedback: 1,
        lastUpdatedAt: new Date().toISOString(),
        adjustments: [],
      },
    },
    { fetchImpl: fakeFetch },
  );
  assert.equal(result.mode, "openai");
  assert.equal(result.text, "Refined response from model.");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.openai\.com\/v1\/chat\/completions/i);

  delete process.env.OPENAI_API_KEY;
  await fs.rm(testRoot, { recursive: true, force: true });
});
