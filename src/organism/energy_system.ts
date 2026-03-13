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

const QUOTAS_FILE = "brain/quotas.json";

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

export async function persistEnergyState(rootDir: string, state: EnergyState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath("brain/energy_state.json", "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}
