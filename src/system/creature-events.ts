import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export type CreatureEventType =
  | "social_ping"
  | "objective_progress"
  | "objective_complete"
  | "maintenance"
  | "error"
  | "recovery";

export interface CreatureEvent {
  at: string;
  type: CreatureEventType;
  detail?: string;
}

interface CreatureEventStore {
  events: CreatureEvent[];
}

const CREATURE_EVENTS_FILE = "brain/creature_events.json";

function storePath(rootDir: string): string {
  return path.join(rootDir, CREATURE_EVENTS_FILE);
}

async function loadStore(rootDir: string): Promise<CreatureEventStore> {
  const target = storePath(rootDir);
  if (!existsSync(target)) return { events: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as CreatureEventStore;
    if (!parsed || !Array.isArray(parsed.events)) return { events: [] };
    return parsed;
  } catch {
    return { events: [] };
  }
}

async function saveStore(rootDir: string, store: CreatureEventStore): Promise<void> {
  const target = storePath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(store, null, 2), "utf-8");
}

export async function recordCreatureEvent(rootDir: string, type: CreatureEventType, detail?: string): Promise<void> {
  const store = await loadStore(rootDir);
  store.events.push({
    at: new Date().toISOString(),
    type,
    detail: detail?.trim() || undefined,
  });
  store.events = store.events.slice(-200);
  await saveStore(rootDir, store);
}

export async function summarizeCreatureEvents(rootDir: string): Promise<{
  total: number;
  recentTypes: CreatureEventType[];
  counts: Record<CreatureEventType, number>;
}> {
  const store = await loadStore(rootDir);
  const counts: Record<CreatureEventType, number> = {
    social_ping: 0,
    objective_progress: 0,
    objective_complete: 0,
    maintenance: 0,
    error: 0,
    recovery: 0,
  };
  for (const event of store.events) {
    counts[event.type] = (counts[event.type] || 0) + 1;
  }
  return {
    total: store.events.length,
    recentTypes: store.events.slice(-10).map((event) => event.type),
    counts,
  };
}
