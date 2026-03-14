import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";
import { recordEpisode, recentEpisodes, loadEpisodicMemory, saveEpisodicMemory, type Episode } from "./episodic_memory.js";
import { storeKnowledge, getKnowledge, loadSemanticMemory, saveSemanticMemory, type SemanticEntry } from "./semantic_memory.js";
import { updateSocialProfile, loadSocialMemory, saveSocialMemory, migrateLegacySocialMemory, type SocialProfile } from "./social_memory.js";
import { appendNarrative, loadNarrative } from "./narrative_memory.js";
import { recordExploration, hasExploredRecently, loadExplorationHistory, saveExplorationHistory } from "./exploration_history.js";
import { loadSocialMemory as loadLegacySocialMemory } from "../system/social-memory.js";

const MEMORY_DIR = "brain/memory";
const EPISODIC_FILE = "brain/memory/episodic_memory.json";
const SEMANTIC_FILE = "brain/memory/semantic_memory.json";
const SOCIAL_FILE = "brain/memory/social_memory.json";
const NARRATIVE_FILE = "brain/memory/narrative.md";
const EXPLORATION_FILE = "brain/memory/exploration_history.json";

async function writeJson(rootDir: string, relativePath: string, payload: unknown): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(relativePath, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(payload, null, 2), "utf-8");
}

async function ensureFile(rootDir: string, relativePath: string, payload: unknown): Promise<void> {
  const target = path.join(rootDir, relativePath);
  if (existsSync(target)) return;
  await writeJson(rootDir, relativePath, payload);
}

async function repairJsonFile<T>(
  rootDir: string,
  loader: (root: string) => Promise<T>,
  saver: (root: string, state: T) => Promise<void>,
): Promise<void> {
  const state = await loader(rootDir);
  await saver(rootDir, state);
}

async function ensureNarrative(rootDir: string): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(NARRATIVE_FILE, "write");
  if (existsSync(target)) return;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, "# Hatchling Narrative\n\n", "utf-8");
}

export async function ensureMemoryState(rootDir: string): Promise<void> {
  PathGuard.setRoot(rootDir);
  await fs.mkdir(path.join(rootDir, MEMORY_DIR), { recursive: true });
  await ensureFile(rootDir, EPISODIC_FILE, { version: 1, episodes: [] });
  await ensureFile(rootDir, SEMANTIC_FILE, { version: 1, entries: [] });
  await ensureFile(rootDir, SOCIAL_FILE, { version: 1, users: {} });
  await ensureFile(rootDir, EXPLORATION_FILE, { version: 1, entries: [] });
  await ensureNarrative(rootDir);

  await repairJsonFile(rootDir, loadEpisodicMemory, saveEpisodicMemory);
  await repairJsonFile(rootDir, loadSemanticMemory, saveSemanticMemory);
  await repairJsonFile(rootDir, loadSocialMemory, saveSocialMemory);
  await repairJsonFile(rootDir, loadExplorationHistory, saveExplorationHistory);

  try {
    const legacy = await loadLegacySocialMemory(rootDir);
    if (legacy && legacy.users && Object.keys(legacy.users).length > 0) {
      await migrateLegacySocialMemory(rootDir, legacy.users);
    }
  } catch {
    // Ignore legacy migration failures.
  }
}

export async function recordEpisodeEntry(
  rootDir: string,
  entry: Omit<Episode, "id" | "timestamp"> & { id?: string; timestamp?: string },
): Promise<Episode> {
  await ensureMemoryState(rootDir);
  return recordEpisode(rootDir, entry);
}

export async function getRecentEpisodes(rootDir: string, limit = 10): Promise<Episode[]> {
  await ensureMemoryState(rootDir);
  return recentEpisodes(rootDir, limit);
}

export async function storeKnowledgeEntry(
  rootDir: string,
  key: string,
  value: string,
  options: { confidence?: number; source?: string } = {},
): Promise<SemanticEntry> {
  await ensureMemoryState(rootDir);
  return storeKnowledge(rootDir, key, value, options);
}

export async function getKnowledgeEntry(rootDir: string, key: string): Promise<SemanticEntry | undefined> {
  await ensureMemoryState(rootDir);
  return getKnowledge(rootDir, key);
}

export async function updateSocialMemoryEntry(
  rootDir: string,
  userId: string,
  updates: Partial<SocialProfile>,
): Promise<SocialProfile> {
  await ensureMemoryState(rootDir);
  return updateSocialProfile(rootDir, userId, updates);
}

export async function appendNarrativeEntry(rootDir: string, entry: string): Promise<void> {
  await ensureMemoryState(rootDir);
  await appendNarrative(rootDir, entry);
}

export async function loadNarrativeMemory(rootDir: string): Promise<string> {
  await ensureMemoryState(rootDir);
  return loadNarrative(rootDir);
}

export async function recordExplorationEntry(rootDir: string, key: string): Promise<void> {
  await ensureMemoryState(rootDir);
  await recordExploration(rootDir, key);
}

export async function wasExploredRecently(rootDir: string, key: string, withinHours = 24): Promise<boolean> {
  await ensureMemoryState(rootDir);
  return hasExploredRecently(rootDir, key, withinHours);
}

export async function loadCanonicalSocialMemory(rootDir: string): Promise<SocialProfile[]> {
  await ensureMemoryState(rootDir);
  const state = await loadSocialMemory(rootDir);
  return Object.values(state.users);
}
