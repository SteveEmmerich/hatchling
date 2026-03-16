import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("mutation suggestion store is seeded and repaired safely", async () => {
  const { ensureMutationSuggestionStore } = await import("../dist/mutation/mutation_suggestions.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-mutation-store-"));
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  process.env.HATCHLING_CONTEXT = "cli";
  await ensureMutationSuggestionStore(tmpRoot);
  const seeded = JSON.parse(await fs.readFile(path.join(tmpRoot, "brain", "mutation_suggestions.json"), "utf-8"));
  assert.equal(seeded.version, 2);
  assert.ok(Array.isArray(seeded.suggestions));

  await fs.writeFile(path.join(tmpRoot, "brain", "mutation_suggestions.json"), "{bad", "utf-8");
  await ensureMutationSuggestionStore(tmpRoot);
  const repaired = JSON.parse(await fs.readFile(path.join(tmpRoot, "brain", "mutation_suggestions.json"), "utf-8"));
  assert.equal(repaired.version, 2);
  assert.ok(Array.isArray(repaired.suggestions));

  delete process.env.HATCHLING_CONTEXT;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("sleep review deduplicates and classifies suggestions conservatively", async () => {
  const { appendMutationSuggestion, reviewMutationSuggestions, loadMutationSuggestionStore } = await import(
    "../dist/mutation/mutation_suggestions.js",
  );
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-mutation-review-"));
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  process.env.HATCHLING_CONTEXT = "cli";

  await appendMutationSuggestion(tmpRoot, {
    summary: "Add safer config validation for onboarding",
    reason: "Repeated failures",
    confidence: 0.7,
    sourceEvent: "task",
  });
  await appendMutationSuggestion(tmpRoot, {
    summary: "Add safer config validation for onboarding",
    reason: "Repeated failures",
    confidence: 0.6,
    sourceEvent: "task",
  });
  await appendMutationSuggestion(tmpRoot, {
    summary: "Improve",
    reason: "Too vague",
    confidence: 0.9,
    sourceEvent: "task",
  });

  const result = await reviewMutationSuggestions(tmpRoot);
  assert.ok(result.approved >= 1);
  assert.ok(result.rejected >= 1);
  assert.ok(result.duplicates >= 1);

  const store = await loadMutationSuggestionStore(tmpRoot);
  const approved = store.suggestions.filter((entry) => entry.status === "approved_for_pipeline");
  const rejected = store.suggestions.filter((entry) => entry.status === "rejected_for_now");
  assert.ok(approved.length >= 1);
  assert.ok(rejected.length >= 1);

  delete process.env.HATCHLING_CONTEXT;
  await fs.rm(tmpRoot, { recursive: true, force: true });
});
