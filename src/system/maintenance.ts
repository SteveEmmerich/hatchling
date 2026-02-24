import fs from "fs/promises";
import path from "path";
import { PathGuard } from "./pathGuard.js";
import { QuotaManager } from "./quotas.js";
import { sleep } from "./sleep.js";
import { Telemetry } from "./telemetry.js";
import { recordCreatureEvent } from "./creature-events.js";

export interface MaintenanceReport {
  timestamp: string;
  lowEnergy: boolean;
  autoSleepTriggered: boolean;
  telemetryPruned: number;
  stagingTrimmed: boolean;
}

export interface MaintenanceDeps {
  now?: () => Date;
  checkDiskUsage?: () => Promise<void>;
  isLowEnergy?: () => Promise<boolean>;
  sleepFn?: () => Promise<void>;
  telemetryKeepFiles?: number;
  stagingMaxChars?: number;
  sleepCooldownMinutes?: number;
}

type LoopHandle = {
  timer: NodeJS.Timeout;
};

const loopHandles = new Map<string, LoopHandle>();

async function readJsonOrDefault<T>(relativePath: string, fallback: T): Promise<T> {
  try {
    const fullPath = await PathGuard.validatePath(relativePath, "read");
    return JSON.parse(await fs.readFile(fullPath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(relativePath: string, data: unknown): Promise<void> {
  const fullPath = await PathGuard.validatePath(relativePath, "write");
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2), "utf-8");
}

async function compactTelemetry(keepFiles: number): Promise<number> {
  const telemetryDir = await PathGuard.validatePath("memory/telemetry", "write");
  await fs.mkdir(telemetryDir, { recursive: true });
  const entries = (await fs.readdir(telemetryDir))
    .filter((name) => name.endsWith(".jsonl"))
    .sort();

  const removable = Math.max(0, entries.length - keepFiles);
  for (const name of entries.slice(0, removable)) {
    await fs.rm(path.join(telemetryDir, name), { force: true });
  }
  return removable;
}

async function compactStagingMemory(maxChars: number): Promise<boolean> {
  const stagingPath = await PathGuard.validatePath("memory/STAGING_MEMORY.md", "write");
  let content = "";
  try {
    content = await fs.readFile(stagingPath, "utf-8");
  } catch {
    await fs.writeFile(stagingPath, "", "utf-8");
    return false;
  }
  if (content.length <= maxChars) return false;
  const trimmed = content.slice(-maxChars);
  await fs.writeFile(stagingPath, trimmed, "utf-8");
  return true;
}

export async function runMaintenanceTick(
  rootDir: string,
  deps: MaintenanceDeps = {},
): Promise<MaintenanceReport> {
  PathGuard.setRoot(rootDir);
  const now = deps.now ? deps.now() : new Date();
  const checkDiskUsage = deps.checkDiskUsage || (() => QuotaManager.checkDiskUsage());
  const isLowEnergy = deps.isLowEnergy || (() => QuotaManager.isLowEnergy());
  const sleepFn = deps.sleepFn || (() => sleep());
  const telemetryKeepFiles = deps.telemetryKeepFiles ?? 14;
  const stagingMaxChars = deps.stagingMaxChars ?? 16000;
  const sleepCooldownMinutes = deps.sleepCooldownMinutes ?? 180;

  await checkDiskUsage();
  const lowEnergy = await isLowEnergy();
  const maintenanceState = await readJsonOrDefault("brain/maintenance_state.json", {
    lastTickAt: "",
    lastAutoSleepAt: "",
    autoSleepCount: 0,
  });

  let autoSleepTriggered = false;
  if (lowEnergy) {
    const lastAutoSleepAt = maintenanceState.lastAutoSleepAt
      ? new Date(maintenanceState.lastAutoSleepAt).getTime()
      : 0;
    const cooldownMs = sleepCooldownMinutes * 60 * 1000;
    const cooldownElapsed = !lastAutoSleepAt || now.getTime() - lastAutoSleepAt >= cooldownMs;
    if (cooldownElapsed) {
      await sleepFn();
      maintenanceState.lastAutoSleepAt = now.toISOString();
      maintenanceState.autoSleepCount = Number(maintenanceState.autoSleepCount || 0) + 1;
      autoSleepTriggered = true;
    }
  }

  const telemetryPruned = await compactTelemetry(telemetryKeepFiles);
  const stagingTrimmed = await compactStagingMemory(stagingMaxChars);

  maintenanceState.lastTickAt = now.toISOString();
  await writeJson("brain/maintenance_state.json", maintenanceState);
  await writeJson("brain/heartbeat.json", {
    timestamp: now.toISOString(),
    lowEnergy,
    autoSleepTriggered,
    telemetryPruned,
    stagingTrimmed,
  });

  const report: MaintenanceReport = {
    timestamp: now.toISOString(),
    lowEnergy,
    autoSleepTriggered,
    telemetryPruned,
    stagingTrimmed,
  };
  await Telemetry.log("pulse", "Maintenance tick completed", report);
  await recordCreatureEvent(rootDir, "maintenance", `lowEnergy=${lowEnergy} autoSleep=${autoSleepTriggered}`);
  return report;
}

export async function startMaintenanceLoop(
  rootDir: string,
  intervalMs?: number,
): Promise<void> {
  if (loopHandles.has(rootDir)) return;
  const resolvedInterval = intervalMs
    ?? Number(process.env.HATCHLING_MAINTENANCE_INTERVAL_MS || "60000");
  if (!Number.isFinite(resolvedInterval) || resolvedInterval < 1000) {
    throw new Error("Invalid maintenance interval. Must be >= 1000ms.");
  }

  await runMaintenanceTick(rootDir).catch(async (error) => {
    await Telemetry.warn(`Maintenance bootstrap tick failed: ${String(error)}`);
    await recordCreatureEvent(rootDir, "error", `maintenance bootstrap: ${String(error)}`);
  });

  const timer = setInterval(() => {
    runMaintenanceTick(rootDir).catch(async (error) => {
      await Telemetry.warn(`Maintenance tick failed: ${String(error)}`);
      await recordCreatureEvent(rootDir, "error", `maintenance tick: ${String(error)}`);
    });
  }, resolvedInterval);
  loopHandles.set(rootDir, { timer });
}

export function stopMaintenanceLoop(rootDir: string): void {
  const handle = loopHandles.get(rootDir);
  if (!handle) return;
  clearInterval(handle.timer);
  loopHandles.delete(rootDir);
}
