import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const JOURNAL_FILE = "brain/evolution_journal.json";

export interface EvolutionUndoAction {
  type: "remove_path" | "remove_mcp" | "restore_capability" | "restore_provider" | "restore_file";
  data: Record<string, any>;
}

export interface EvolutionRunRecord {
  runId: string;
  goal: string;
  createdAt: string;
  actions: Array<{ type: string; params: Record<string, any>; reason: string }>;
  results: Array<{ type: string; success: boolean; message: string }>;
  undo: EvolutionUndoAction[];
  rolledBackAt?: string;
}

interface EvolutionJournal {
  runs: EvolutionRunRecord[];
}

function journalPath(rootDir: string): string {
  return path.join(rootDir, JOURNAL_FILE);
}

async function loadJournal(rootDir: string): Promise<EvolutionJournal> {
  const target = journalPath(rootDir);
  if (!existsSync(target)) {
    return { runs: [] };
  }
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as EvolutionJournal;
    if (!parsed || !Array.isArray(parsed.runs)) return { runs: [] };
    return parsed;
  } catch {
    return { runs: [] };
  }
}

async function saveJournal(rootDir: string, journal: EvolutionJournal): Promise<void> {
  const target = journalPath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(journal, null, 2), "utf-8");
}

export async function recordEvolutionRun(rootDir: string, run: EvolutionRunRecord): Promise<void> {
  const journal = await loadJournal(rootDir);
  journal.runs.push(run);
  await saveJournal(rootDir, journal);
}

export async function listEvolutionRuns(rootDir: string): Promise<EvolutionRunRecord[]> {
  const journal = await loadJournal(rootDir);
  return [...journal.runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getRollbackCandidate(rootDir: string, runId?: string): Promise<EvolutionRunRecord | null> {
  const runs = await listEvolutionRuns(rootDir);
  if (runId) {
    return runs.find((run) => run.runId === runId && !run.rolledBackAt) || null;
  }
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i];
    if (!run.rolledBackAt && run.undo.length > 0) {
      return run;
    }
  }
  return null;
}

export async function markRunRolledBack(rootDir: string, runId: string): Promise<void> {
  const journal = await loadJournal(rootDir);
  const run = journal.runs.find((entry) => entry.runId === runId);
  if (!run) return;
  run.rolledBackAt = new Date().toISOString();
  await saveJournal(rootDir, journal);
}
