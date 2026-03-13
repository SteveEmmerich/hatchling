import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";

export interface EnergyState {
  level: number;
  lowEnergy: boolean;
  lastUpdatedAt: string;
  tokensUsedToday: number;
  tokensBudgetDaily: number;
}

export const DEFAULT_SLEEP_THRESHOLD = 10;
export const DEFAULT_CRITICAL_THRESHOLD = 5;

const QUOTAS_FILE = "brain/quotas.json";
const ENERGY_STATE_FILE = "brain/energy_state.json";

async function loadQuotas(rootDir: string): Promise<{
  tokens: { today: number; maxPerDay: number };
}> {
  const target = path.join(rootDir, QUOTAS_FILE);
  if (!existsSync(target)) {
    return { tokens: { today: 0, maxPerDay: 100000 } };
  }
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as Record<string, any>;
    const tokens = parsed.tokens || {};
    return {
      tokens: {
        today: Number(tokens.today || 0),
        maxPerDay: Number(tokens.maxPerDay || 100000),
      },
    };
  } catch {
    return { tokens: { today: 0, maxPerDay: 100000 } };
  }
}

export async function deriveEnergyState(rootDir: string): Promise<EnergyState> {
  const now = new Date().toISOString();
  const quotas = await loadQuotas(rootDir);
  const maxPerDay = Math.max(1, Number(quotas.tokens.maxPerDay || 100000));
  const used = Math.max(0, Number(quotas.tokens.today || 0));
  const usageRatio = Math.min(1, used / maxPerDay);
  const level = Math.max(0, Math.min(100, Math.round((1 - usageRatio) * 100)));
  const lowEnergy = usageRatio >= 0.85;
  return {
    level,
    lowEnergy,
    lastUpdatedAt: now,
    tokensUsedToday: used,
    tokensBudgetDaily: maxPerDay,
  };
}

export async function getEnergyState(rootDir: string): Promise<EnergyState> {
  return deriveEnergyState(rootDir);
}

export async function persistEnergyState(rootDir: string, state: EnergyState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(ENERGY_STATE_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

function energyCostForTaskType(taskType: string): number {
  switch (taskType) {
    case "sleep_task":
      return 1;
    case "mutation_task":
      return 7;
    case "curiosity_task":
      return 4;
    case "user_task":
      return 5;
    case "project_task":
      return 5;
    default:
      return 3;
  }
}

export async function consumeEnergy(rootDir: string, taskType: string, costOverride?: number): Promise<EnergyState> {
  const current = await getEnergyState(rootDir);
  const cost = Number.isFinite(costOverride)
    ? Math.max(0, Number(costOverride))
    : energyCostForTaskType(taskType);
  const nextLevel = Math.max(0, Math.min(100, current.level - Math.round(cost * 10)));
  const updated: EnergyState = {
    ...current,
    level: nextLevel,
    lowEnergy: nextLevel <= DEFAULT_SLEEP_THRESHOLD,
    lastUpdatedAt: new Date().toISOString(),
  };
  await persistEnergyState(rootDir, updated);
  return updated;
}

export function shouldSleep(
  state: EnergyState,
  thresholds: { sleepThreshold?: number; criticalThreshold?: number } = {},
): boolean {
  const sleepThreshold = thresholds.sleepThreshold ?? DEFAULT_SLEEP_THRESHOLD;
  const criticalThreshold = thresholds.criticalThreshold ?? DEFAULT_CRITICAL_THRESHOLD;
  return state.level <= sleepThreshold || state.level <= criticalThreshold;
}
