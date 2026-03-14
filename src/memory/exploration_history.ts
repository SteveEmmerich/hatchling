import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";

export interface ExplorationEntry {
  key: string;
  lastExploredAt: string;
  count: number;
}

export interface ExplorationHistoryState {
  version: 1;
  entries: ExplorationEntry[];
}

const EXPLORATION_FILE = "brain/memory/exploration_history.json";

function nowIso(): string {
  return new Date().toISOString();
}

export async function loadExplorationHistory(rootDir: string): Promise<ExplorationHistoryState> {
  const target = path.join(rootDir, EXPLORATION_FILE);
  if (!existsSync(target)) return { version: 1, entries: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as ExplorationHistoryState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return {
      version: 1,
      entries: parsed.entries.map((entry) => ({
        key: String(entry.key || ""),
        lastExploredAt: entry.lastExploredAt || nowIso(),
        count: Number(entry.count || 0),
      })),
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

export async function saveExplorationHistory(rootDir: string, state: ExplorationHistoryState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(EXPLORATION_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

export async function recordExploration(rootDir: string, key: string): Promise<ExplorationEntry> {
  const state = await loadExplorationHistory(rootDir);
  const normalized = String(key || "").trim().toLowerCase();
  const existing = state.entries.find((entry) => entry.key === normalized);
  if (existing) {
    existing.count += 1;
    existing.lastExploredAt = nowIso();
    await saveExplorationHistory(rootDir, state);
    return existing;
  }
  const entry: ExplorationEntry = {
    key: normalized,
    lastExploredAt: nowIso(),
    count: 1,
  };
  state.entries.push(entry);
  await saveExplorationHistory(rootDir, state);
  return entry;
}

export async function hasExploredRecently(rootDir: string, key: string, withinHours = 24): Promise<boolean> {
  const state = await loadExplorationHistory(rootDir);
  const normalized = String(key || "").trim().toLowerCase();
  const entry = state.entries.find((item) => item.key === normalized);
  if (!entry) return false;
  const last = new Date(entry.lastExploredAt).getTime();
  if (!Number.isFinite(last)) return false;
  const threshold = withinHours * 60 * 60 * 1000;
  return Date.now() - last <= threshold;
}
