import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";

export interface Episode {
  id: string;
  timestamp: string;
  event: string;
  outcome?: string;
  reward?: number;
  context?: Record<string, unknown>;
}

export interface EpisodicMemoryState {
  version: 1;
  episodes: Episode[];
}

const EPISODIC_FILE = "brain/memory/episodic_memory.json";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEpisode(entry: Episode): Episode {
  return {
    ...entry,
    timestamp: entry.timestamp || nowIso(),
    event: String(entry.event || "").trim(),
  };
}

export async function loadEpisodicMemory(rootDir: string): Promise<EpisodicMemoryState> {
  const target = path.join(rootDir, EPISODIC_FILE);
  if (!existsSync(target)) return { version: 1, episodes: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as EpisodicMemoryState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.episodes)) {
      return { version: 1, episodes: [] };
    }
    return {
      version: 1,
      episodes: parsed.episodes.map(normalizeEpisode),
    };
  } catch {
    return { version: 1, episodes: [] };
  }
}

export async function saveEpisodicMemory(rootDir: string, state: EpisodicMemoryState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(EPISODIC_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

export async function recordEpisode(
  rootDir: string,
  entry: Omit<Episode, "id" | "timestamp"> & { id?: string; timestamp?: string },
  maxEpisodes = 200,
): Promise<Episode> {
  const state = await loadEpisodicMemory(rootDir);
  const episode: Episode = normalizeEpisode({
    id: entry.id || `ep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: entry.timestamp || nowIso(),
    event: entry.event,
    outcome: entry.outcome,
    reward: entry.reward,
    context: entry.context,
  });
  state.episodes.push(episode);
  if (state.episodes.length > maxEpisodes) {
    state.episodes = state.episodes.slice(-maxEpisodes);
  }
  await saveEpisodicMemory(rootDir, state);
  return episode;
}

export async function recentEpisodes(rootDir: string, limit = 10): Promise<Episode[]> {
  const state = await loadEpisodicMemory(rootDir);
  return state.episodes.slice(-limit);
}
