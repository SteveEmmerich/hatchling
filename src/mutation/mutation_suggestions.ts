import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";

export type MutationSuggestionStatus =
  | "pending"
  | "reviewed"
  | "approved_for_pipeline"
  | "rejected_for_now";

export interface MutationSuggestionRecord {
  id: string;
  summary: string;
  reason: string;
  confidence: number;
  sourceEvent?: string;
  sourceReflection?: string;
  createdAt: string;
  status: MutationSuggestionStatus;
  reviewedAt?: string;
  reviewReason?: string;
}

export interface MutationSuggestionStore {
  version: 2;
  suggestions: MutationSuggestionRecord[];
}

const MUTATION_SUGGESTIONS_FILE = "brain/mutation_suggestions.json";

function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeSummaryKey(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function sanitizeStatus(value: unknown): MutationSuggestionStatus {
  const status = String(value || "").trim();
  switch (status) {
    case "reviewed":
    case "approved_for_pipeline":
    case "rejected_for_now":
    case "pending":
      return status;
    default:
      return "pending";
  }
}

function sanitizeRecord(input: Record<string, unknown>, now: Date): MutationSuggestionRecord | null {
  const summaryRaw = normalizeText(input.summary || input.suggestion);
  if (!summaryRaw) return null;
  const createdAt = normalizeText(input.createdAt || input.timestamp) || nowIso(now);
  const id = normalizeText(input.id) || `mut_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const reason = normalizeText(input.reason || input.outcome);
  const confidence = clamp(Number(input.confidence ?? 0.5), 0, 1);
  const sourceEvent = normalizeText(input.sourceEvent || input.source_event || input.source) || undefined;
  const sourceReflection = normalizeText(input.sourceReflection || input.source_reflection) || undefined;
  const status = sanitizeStatus(input.status);
  const reviewedAt = normalizeText(input.reviewedAt) || undefined;
  const reviewReason = normalizeText(input.reviewReason || input.reason) || undefined;
  return {
    id,
    summary: summaryRaw,
    reason,
    confidence,
    sourceEvent,
    sourceReflection,
    createdAt,
    status,
    reviewedAt,
    reviewReason,
  };
}

function sanitizeStore(input: unknown, now: Date): MutationSuggestionStore {
  if (!input || typeof input !== "object") {
    return { version: 2, suggestions: [] as MutationSuggestionRecord[] };
  }
  const record = input as Record<string, unknown>;
  const rawSuggestions = Array.isArray(record.suggestions) ? record.suggestions : [];
  const suggestions = rawSuggestions
    .map((entry) => (entry && typeof entry === "object" ? sanitizeRecord(entry as Record<string, unknown>, now) : null))
    .filter(Boolean) as MutationSuggestionRecord[];
  const store: MutationSuggestionStore = { version: 2, suggestions };
  return store;
}

async function writeStore(rootDir: string, store: MutationSuggestionStore): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(MUTATION_SUGGESTIONS_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(store, null, 2), "utf-8");
}

export async function ensureMutationSuggestionStore(rootDir: string, now: Date = new Date()): Promise<MutationSuggestionStore> {
  const target = path.join(rootDir, MUTATION_SUGGESTIONS_FILE);
  if (!existsSync(target)) {
    const empty: MutationSuggestionStore = { version: 2, suggestions: [] };
    await writeStore(rootDir, empty);
    return empty;
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(await fs.readFile(target, "utf-8"));
  } catch {
    parsed = null;
  }
  const store = sanitizeStore(parsed, now);
  await writeStore(rootDir, store);
  return store;
}

export async function loadMutationSuggestionStore(rootDir: string, now: Date = new Date()): Promise<MutationSuggestionStore> {
  const target = path.join(rootDir, MUTATION_SUGGESTIONS_FILE);
  if (!existsSync(target)) {
    return { version: 2, suggestions: [] } as MutationSuggestionStore;
  }
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8"));
    return sanitizeStore(parsed, now);
  } catch {
    return { version: 2, suggestions: [] } as MutationSuggestionStore;
  }
}

export async function appendMutationSuggestion(
  rootDir: string,
  input: {
    summary: string;
    reason?: string;
    confidence: number;
    sourceEvent?: string;
    sourceReflection?: string;
    createdAt?: string;
  },
  now: Date = new Date(),
): Promise<MutationSuggestionRecord> {
  const store = await ensureMutationSuggestionStore(rootDir, now);
  const record = sanitizeRecord(
    {
      summary: input.summary,
      reason: input.reason,
      confidence: input.confidence,
      sourceEvent: input.sourceEvent,
      sourceReflection: input.sourceReflection,
      createdAt: input.createdAt || nowIso(now),
      status: "pending",
    },
    now,
  );
  if (!record) {
    throw new Error("Mutation suggestion summary is required.");
  }
  store.suggestions.push(record);
  if (store.suggestions.length > 300) {
    store.suggestions = store.suggestions.slice(-300);
  }
  await writeStore(rootDir, store);
  return record;
}

function isTooGeneric(summary: string): boolean {
  const normalized = normalizeSummaryKey(summary);
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return true;
  if (summary.length < 12) return true;
  if (/(improve|optimize|refactor|cleanup|fix|enhance)$/.test(normalized)) return true;
  if (/(something|stuff|things)/.test(normalized)) return true;
  return false;
}

export async function reviewMutationSuggestions(
  rootDir: string,
  now: Date = new Date(),
): Promise<{ reviewed: number; approved: number; rejected: number; duplicates: number }> {
  const store = await ensureMutationSuggestionStore(rootDir, now);
  const summaryIndex = new Map<string, MutationSuggestionRecord>();
  for (const entry of store.suggestions) {
    if (entry.status === "pending" || entry.status === "rejected_for_now") continue;
    const key = normalizeSummaryKey(entry.summary);
    if (key) summaryIndex.set(key, entry);
  }

  let reviewed = 0;
  let approved = 0;
  let rejected = 0;
  let duplicates = 0;
  for (const entry of store.suggestions) {
    if (entry.status !== "pending") continue;
    const key = normalizeSummaryKey(entry.summary);
    if (!key) {
      entry.status = "rejected_for_now";
      entry.reviewReason = "empty_summary";
      entry.reviewedAt = nowIso(now);
      rejected += 1;
      continue;
    }
    const existing = summaryIndex.get(key);
    if (existing && existing.id !== entry.id) {
      entry.status = "rejected_for_now";
      entry.reviewReason = "duplicate";
      entry.reviewedAt = nowIso(now);
      rejected += 1;
      duplicates += 1;
      continue;
    }
    summaryIndex.set(key, entry);
    if (isTooGeneric(entry.summary)) {
      entry.status = "rejected_for_now";
      entry.reviewReason = "too_generic";
      entry.reviewedAt = nowIso(now);
      rejected += 1;
      continue;
    }
    if (entry.confidence >= 0.65) {
      entry.status = "approved_for_pipeline";
      entry.reviewedAt = nowIso(now);
      approved += 1;
      continue;
    }
    if (entry.confidence >= 0.45) {
      entry.status = "reviewed";
      entry.reviewedAt = nowIso(now);
      reviewed += 1;
      continue;
    }
    entry.status = "rejected_for_now";
    entry.reviewReason = "low_confidence";
    entry.reviewedAt = nowIso(now);
    rejected += 1;
  }

  if (store.suggestions.length > 300) {
    store.suggestions = store.suggestions.slice(-300);
  }
  await writeStore(rootDir, store);
  return { reviewed, approved, rejected, duplicates };
}

export async function summarizeMutationSuggestions(rootDir: string): Promise<{
  pending: number;
  reviewed: number;
  approved: number;
  rejected: number;
  recent: MutationSuggestionRecord[];
}> {
  const store = await loadMutationSuggestionStore(rootDir);
  const pending = store.suggestions.filter((entry) => entry.status === "pending").length;
  const reviewed = store.suggestions.filter((entry) => entry.status === "reviewed").length;
  const approved = store.suggestions.filter((entry) => entry.status === "approved_for_pipeline").length;
  const rejected = store.suggestions.filter((entry) => entry.status === "rejected_for_now").length;
  const recent = store.suggestions.slice(-5);
  return { pending, reviewed, approved, rejected, recent };
}
