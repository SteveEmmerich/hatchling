import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";

export interface OrganismState {
  version: 1;
  lastTickAt: string;
  energy: {
    level: number;
    lowEnergy: boolean;
    lastUpdatedAt: string;
    tokensUsedToday: number;
    tokensBudgetDaily: number;
  };
  tasks: {
    lastSelectedTaskId?: string;
    queueDepth: number;
  };
  selectedTask?: {
    id: string;
    type: string;
    goal: string;
    score: number;
    selectedAt: string;
  };
}

const ORGANISM_STATE_FILE = "brain/organism_state.json";

function defaultState(): OrganismState {
  const now = new Date().toISOString();
  return {
    version: 1,
    lastTickAt: now,
    energy: {
      level: 50,
      lowEnergy: false,
      lastUpdatedAt: now,
      tokensUsedToday: 0,
      tokensBudgetDaily: 100000,
    },
    tasks: {
      queueDepth: 0,
    },
  };
}

export async function loadOrganismState(rootDir: string): Promise<OrganismState> {
  const target = path.join(rootDir, ORGANISM_STATE_FILE);
  if (!existsSync(target)) {
    return defaultState();
  }
  try {
    const raw = JSON.parse(await fs.readFile(target, "utf-8")) as OrganismState;
    if (!raw || raw.version !== 1) return defaultState();
    return raw;
  } catch {
    return defaultState();
  }
}

export async function saveOrganismState(rootDir: string, state: OrganismState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(ORGANISM_STATE_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}
