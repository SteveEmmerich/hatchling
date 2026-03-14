import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("memory files are seeded correctly", async () => {
  const { ensureMemoryState } = await import("../dist/memory/memory_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-memory-seed-"));
  process.env.HATCHLING_CONTEXT = "cli";
  await ensureMemoryState(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;

  const memoryDir = path.join(tmpRoot, "brain", "memory");
  const episodic = path.join(memoryDir, "episodic_memory.json");
  const semantic = path.join(memoryDir, "semantic_memory.json");
  const social = path.join(memoryDir, "social_memory.json");
  const narrative = path.join(memoryDir, "narrative.md");
  const exploration = path.join(memoryDir, "exploration_history.json");

  const files = await fs.readdir(memoryDir);
  assert.ok(files.includes("episodic_memory.json"));
  assert.ok(files.includes("semantic_memory.json"));
  assert.ok(files.includes("social_memory.json"));
  assert.ok(files.includes("narrative.md"));
  assert.ok(files.includes("exploration_history.json"));
  await fs.access(episodic);
  await fs.access(semantic);
  await fs.access(social);
  await fs.access(narrative);
  await fs.access(exploration);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("episodic memory records and retrieves events", async () => {
  const { recordEpisodeEntry, getRecentEpisodes } = await import("../dist/memory/memory_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-episode-"));
  process.env.HATCHLING_CONTEXT = "cli";
  await recordEpisodeEntry(tmpRoot, {
    event: "completed maintenance",
    outcome: "ok",
    reward: 1,
  });
  const episodes = await getRecentEpisodes(tmpRoot, 5);
  delete process.env.HATCHLING_CONTEXT;
  assert.ok(episodes.length >= 1);
  assert.equal(episodes[episodes.length - 1].event, "completed maintenance");
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("semantic memory stores and retrieves knowledge", async () => {
  const { storeKnowledgeEntry, getKnowledgeEntry } = await import("../dist/memory/memory_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-semantic-"));
  process.env.HATCHLING_CONTEXT = "cli";
  await storeKnowledgeEntry(tmpRoot, "launch_day", "friday", { confidence: 0.8 });
  const entry = await getKnowledgeEntry(tmpRoot, "launch_day");
  delete process.env.HATCHLING_CONTEXT;
  assert.ok(entry);
  assert.equal(entry.value, "friday");
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("social memory updates user relationship state", async () => {
  const { updateSocialMemoryEntry, loadCanonicalSocialMemory } = await import("../dist/memory/memory_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-social-"));
  process.env.HATCHLING_CONTEXT = "cli";
  await updateSocialMemoryEntry(tmpRoot, "user:1", {
    trust: 60,
    interactionCount: 4,
    preferences: { verbosity: "brief" },
    facts: { timezone: "PST" },
  });
  const users = await loadCanonicalSocialMemory(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;
  const user = users.find((entry) => entry.id === "user:1");
  assert.ok(user);
  assert.equal(user?.trust, 60);
  assert.equal(user?.preferences.verbosity, "brief");
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("narrative memory appends safely", async () => {
  const { appendNarrativeEntry, loadNarrativeMemory } = await import("../dist/memory/memory_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-narrative-"));
  process.env.HATCHLING_CONTEXT = "cli";
  await appendNarrativeEntry(tmpRoot, "Started new learning cycle.");
  const narrative = await loadNarrativeMemory(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;
  assert.ok(narrative.includes("Started new learning cycle."));
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("exploration history prevents duplicate processing patterns", async () => {
  const { recordExplorationEntry, wasExploredRecently } = await import("../dist/memory/memory_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-explore-"));
  process.env.HATCHLING_CONTEXT = "cli";
  await recordExplorationEntry(tmpRoot, "codebase-scan");
  const recent = await wasExploredRecently(tmpRoot, "codebase-scan", 48);
  delete process.env.HATCHLING_CONTEXT;
  assert.equal(recent, true);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("malformed memory files are repaired safely", async () => {
  const { ensureMemoryState } = await import("../dist/memory/memory_manager.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-memory-repair-"));
  await fs.mkdir(path.join(tmpRoot, "brain", "memory"), { recursive: true });
  await fs.writeFile(path.join(tmpRoot, "brain", "memory", "episodic_memory.json"), "{bad", "utf-8");
  await fs.writeFile(path.join(tmpRoot, "brain", "memory", "semantic_memory.json"), "{bad", "utf-8");
  await fs.writeFile(path.join(tmpRoot, "brain", "memory", "social_memory.json"), "{bad", "utf-8");
  await fs.writeFile(path.join(tmpRoot, "brain", "memory", "exploration_history.json"), "{bad", "utf-8");
  process.env.HATCHLING_CONTEXT = "cli";
  await ensureMemoryState(tmpRoot);
  delete process.env.HATCHLING_CONTEXT;
  const episodic = JSON.parse(
    await fs.readFile(path.join(tmpRoot, "brain", "memory", "episodic_memory.json"), "utf-8"),
  );
  assert.ok(Array.isArray(episodic.episodes));
  await fs.rm(tmpRoot, { recursive: true, force: true });
});
