import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";

export interface SemanticEntry {
  key: string;
  value: string;
  confidence: number;
  source?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticMemoryState {
  version: 1;
  entries: SemanticEntry[];
}

const SEMANTIC_FILE = "brain/memory/semantic_memory.json";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEntry(entry: SemanticEntry): SemanticEntry {
  return {
    ...entry,
    key: String(entry.key || "").trim(),
    value: String(entry.value || "").trim(),
    confidence: Number.isFinite(entry.confidence) ? Math.max(0, Math.min(1, entry.confidence)) : 0.5,
    createdAt: entry.createdAt || nowIso(),
    updatedAt: entry.updatedAt || nowIso(),
  };
}

export async function loadSemanticMemory(rootDir: string): Promise<SemanticMemoryState> {
  const target = path.join(rootDir, SEMANTIC_FILE);
  if (!existsSync(target)) return { version: 1, entries: [] };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as SemanticMemoryState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return {
      version: 1,
      entries: parsed.entries.map(normalizeEntry),
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

export async function saveSemanticMemory(rootDir: string, state: SemanticMemoryState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(SEMANTIC_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

export async function storeKnowledge(
  rootDir: string,
  key: string,
  value: string,
  options: { confidence?: number; source?: string } = {},
): Promise<SemanticEntry> {
  const state = await loadSemanticMemory(rootDir);
  const now = nowIso();
  const normalizedKey = String(key || "").trim().toLowerCase();
  const existing = state.entries.find((entry) => entry.key.toLowerCase() === normalizedKey);
  if (existing) {
    existing.value = value;
    existing.confidence = Number.isFinite(options.confidence)
      ? Math.max(0, Math.min(1, Number(options.confidence)))
      : existing.confidence;
    existing.source = options.source ?? existing.source;
    existing.updatedAt = now;
    await saveSemanticMemory(rootDir, state);
    return normalizeEntry(existing);
  }
  const entry: SemanticEntry = normalizeEntry({
    key: key,
    value: value,
    confidence: Number.isFinite(options.confidence) ? Math.max(0, Math.min(1, Number(options.confidence))) : 0.6,
    source: options.source,
    createdAt: now,
    updatedAt: now,
  });
  state.entries.push(entry);
  await saveSemanticMemory(rootDir, state);
  return entry;
}

export async function getKnowledge(rootDir: string, key: string): Promise<SemanticEntry | undefined> {
  const state = await loadSemanticMemory(rootDir);
  const normalizedKey = String(key || "").trim().toLowerCase();
  return state.entries.find((entry) => entry.key.toLowerCase() === normalizedKey);
}

export async function listKnowledge(rootDir: string): Promise<SemanticEntry[]> {
  const state = await loadSemanticMemory(rootDir);
  return state.entries;
}
