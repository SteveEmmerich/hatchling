import { PathGuard } from './pathGuard.js';
import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { reflectSleepCycle, type ReflectionSignalState } from '../brain/reflection_engine.js';
import { loadEpisodicMemory, saveEpisodicMemory, type Episode } from '../memory/episodic_memory.js';
import { appendNarrativeEntry, loadNarrativeMemory } from '../memory/memory_manager.js';
import { loadSocialMemory, saveSocialMemory, type SocialProfile } from '../memory/social_memory.js';
import { loadPersonalityState, savePersonalityState } from '../system/personality-adaptation.js';
import { loadExplorationHistory, saveExplorationHistory } from '../memory/exploration_history.js';
import { persistEnergyState } from '../organism/energy_system.js';
import { reviewMutationSuggestions, ensureMutationSuggestionStore } from '../mutation/mutation_suggestions.js';

const REFLECTION_SIGNALS_FILE = "brain/reflection_signals.json";
const HEARTBEAT_FILE = "brain/heartbeat.json";

async function synthesizeExperience(root: string, day: string): Promise<{
  eventCount: number;
  typeCounts: Record<string, number>;
}> {
  const telemetryDir = await PathGuard.validatePath("memory/telemetry", "read");
  let telemetryFiles: string[] = [];
  try {
    telemetryFiles = (await fs.readdir(telemetryDir))
      .filter((f) => f.endsWith(".jsonl"))
      .sort();
  } catch {
    telemetryFiles = [];
  }

  const latestTelemetry = telemetryFiles.length
    ? telemetryFiles[telemetryFiles.length - 1]
    : null;

  let eventCount = 0;
  const typeCounts: Record<string, number> = {};
  if (latestTelemetry) {
    const content = await fs.readFile(`${telemetryDir}/${latestTelemetry}`, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        eventCount += 1;
        const type = String(parsed.type || "unknown");
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      } catch {
        // Ignore malformed telemetry lines.
      }
    }
  }

  const summary = Object.entries(typeCounts)
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
  const experiencePath = await PathGuard.validatePath("brain/EXPERIENCE.md", "write");
  const note = [
    `## Sleep Cycle ${day}`,
    `- Telemetry events analyzed: ${eventCount}`,
    `- Event type distribution: ${summary || "none"}`,
    "",
  ].join("\n");
  await fs.appendFile(experiencePath, `${note}\n`);

  return { eventCount, typeCounts };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeEventKey(event: string, outcome?: string): string {
  return `${String(event || "").trim().toLowerCase()}|${String(outcome || "").trim().toLowerCase()}`;
}

async function consolidateEpisodes(rootDir: string, now: string): Promise<{
  consolidated: number;
  summaries: number;
  summaryKeys: string[];
}> {
  const state = await loadEpisodicMemory(rootDir);
  const groups = new Map<string, Episode[]>();
  for (const episode of state.episodes) {
    const key = normalizeEventKey(episode.event, episode.outcome);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(episode);
  }

  let consolidated = 0;
  let summaries = 0;
  const summaryKeys: string[] = [];
  const existingSummaryKeys = new Set(
    state.episodes
      .filter((episode) => episode.summaryOf)
      .map((episode) => String(episode.summaryOf)),
  );

  for (const [key, episodes] of groups.entries()) {
    const ordered = episodes.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (ordered.length <= 1) continue;
    const latest = ordered[ordered.length - 1];
    for (const episode of ordered.slice(0, -1)) {
      if (!episode.consolidated) {
        episode.consolidated = true;
        episode.consolidatedAt = now;
        consolidated += 1;
      }
    }
    if (ordered.length >= 3 && !existingSummaryKeys.has(key)) {
      state.episodes.push({
        id: `summary_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        event: `consolidated: ${latest.event}`,
        outcome: `Repeated ${ordered.length} times`,
        summaryOf: key,
        consolidated: true,
        consolidatedAt: now,
      });
      summaries += 1;
      summaryKeys.push(key);
      existingSummaryKeys.add(key);
    }
  }

  if (state.episodes.length > 200) {
    state.episodes = state.episodes.slice(-200);
  }
  await saveEpisodicMemory(rootDir, state);
  return { consolidated, summaries, summaryKeys };
}

function shouldNarrate(episode: Episode): boolean {
  if (episode.consolidated) return false;
  if (episode.reward !== undefined && Math.abs(Number(episode.reward)) >= 0.6) return true;
  const outcome = String(episode.outcome || "");
  return /\b(success|failed|blocked|milestone|resolved)\b/i.test(outcome);
}

async function synthesizeNarrative(rootDir: string, episodes: Episode[]): Promise<string[]> {
  const narrative = await loadNarrativeMemory(rootDir);
  const entries: string[] = [];
  for (const episode of episodes) {
    if (!shouldNarrate(episode)) continue;
    const text = `${episode.event}: ${episode.outcome || "noted"}`.trim();
    if (!text || narrative.includes(text)) continue;
    entries.push(text.length > 200 ? `${text.slice(0, 197)}...` : text);
    if (entries.length >= 3) break;
  }
  for (const entry of entries) {
    await appendNarrativeEntry(rootDir, entry);
  }
  return entries;
}

async function reviewBehavioralAdjustments(rootDir: string, now: string): Promise<{
  confidenceDelta: number;
  curiosityDelta: number;
  trustDelta: number;
}> {
  const signalPath = path.join(rootDir, REFLECTION_SIGNALS_FILE);
  let state: ReflectionSignalState = { version: 1, signals: [] };
  try {
    state = JSON.parse(await fs.readFile(signalPath, "utf-8")) as ReflectionSignalState;
    if (!state || state.version !== 1 || !Array.isArray(state.signals)) {
      state = { version: 1, signals: [] };
    }
  } catch {
    state = { version: 1, signals: [] };
  }

  const pending = state.signals.filter((signal) => !signal.consumed);
  if (pending.length === 0) return { confidenceDelta: 0, curiosityDelta: 0, trustDelta: 0 };

  const confidenceDelta = clamp(
    pending.reduce((sum, signal) => sum + Number(signal.confidenceDelta || 0), 0),
    -0.5,
    0.5,
  );
  const curiosityDelta = clamp(
    pending.reduce((sum, signal) => sum + Number(signal.curiosityDelta || 0), 0),
    -0.5,
    0.5,
  );
  const trustSignals = pending.filter((signal) => signal.userId);

  if (Math.abs(confidenceDelta) > 0.001) {
    const personality = await loadPersonalityState(rootDir);
    personality.signals.confidence = clamp(personality.signals.confidence + confidenceDelta, 0, 10);
    personality.lastUpdatedAt = now;
    await savePersonalityState(rootDir, personality);
  }

  if (Math.abs(curiosityDelta) > 0.001) {
    const curiosityPath = await PathGuard.validatePath("brain/curiosity_state.json", "write");
    let curiosity: {
      adjustedCuriosity: number;
      adjustments: Array<{ timestamp: string; reason: string; delta: number }>;
      lastCalculated?: string;
    } = { adjustedCuriosity: 5, adjustments: [] };
    try {
      curiosity = JSON.parse(await fs.readFile(curiosityPath, "utf-8"));
    } catch {
      curiosity = { adjustedCuriosity: 5, adjustments: [] };
    }
    const updated = clamp(Number(curiosity.adjustedCuriosity || 5) + curiosityDelta, 1, 10);
    curiosity.adjustedCuriosity = Number(updated.toFixed(2));
    curiosity.adjustments = [
      ...(curiosity.adjustments || []),
      { timestamp: now, reason: "sleep-review", delta: Number(curiosityDelta.toFixed(2)) },
    ].slice(-50);
    curiosity.lastCalculated = now;
    await fs.writeFile(curiosityPath, JSON.stringify(curiosity, null, 2));
  }

  if (trustSignals.length > 0) {
    const social = await loadSocialMemory(rootDir);
    for (const signal of trustSignals) {
      const userId = String(signal.userId).toLowerCase();
      const existing = social.users[userId];
      const delta = clamp(Number(signal.trustDelta || 0), -5, 5);
      if (!existing) continue;
      const updated: SocialProfile = {
        ...existing,
        trust: clamp(existing.trust + delta, 0, 100),
        interactionCount: Math.max(existing.interactionCount, 1),
        lastSeenAt: now,
        notes: existing.notes || [],
      };
      social.users[userId] = updated;
    }
    await saveSocialMemory(rootDir, social);
  }

  for (const signal of pending) {
    signal.consumed = true;
    signal.consumedAt = now;
  }
  const target = await PathGuard.validatePath(REFLECTION_SIGNALS_FILE, "write");
  await fs.writeFile(target, JSON.stringify(state, null, 2));

  return {
    confidenceDelta,
    curiosityDelta,
    trustDelta: trustSignals.reduce((sum, signal) => sum + Number(signal.trustDelta || 0), 0),
  };
}

async function reviewMutationSuggestionsForSleep(rootDir: string, now: string): Promise<void> {
  await ensureMutationSuggestionStore(rootDir, new Date(now));
  await reviewMutationSuggestions(rootDir, new Date(now));
}

async function maintainExplorationHistory(rootDir: string, summaryKeys: string[], now: string): Promise<void> {
  const history = await loadExplorationHistory(rootDir);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  history.entries = history.entries.filter((entry) => {
    const last = new Date(entry.lastExploredAt).getTime();
    return Number.isFinite(last) && last >= cutoff;
  });
  for (const key of summaryKeys) {
    history.entries.push({
      key: `consolidated:${key}`,
      lastExploredAt: now,
      count: 1,
    });
  }
  history.entries.push({ key: "sleep-cycle", lastExploredAt: now, count: 1 });
  if (history.entries.length > 300) {
    history.entries = history.entries.slice(-300);
  }
  await saveExplorationHistory(rootDir, history);
}

export async function sleep() {
  console.log('🌙 Initiating Sleep Cycle...');

  const today = new Date().toISOString().split('T')[0];
  const root = PathGuard.getAgentRoot();
  const nowIso = new Date().toISOString();

  // 1. Snapshot State
  const snapshot = {
    date: nowIso,
    mutationState: JSON.parse(
      await fs.readFile(await PathGuard.validatePath('brain/mutation_state.json', 'read'), 'utf-8'),
    ),
    quotas: JSON.parse(
      await fs.readFile(await PathGuard.validatePath('brain/quotas.json', 'read'), 'utf-8'),
    ),
    // Get current git hash
    commitHash: execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf-8' }).trim()
  };

  const sleepLogPath = await PathGuard.validatePath(`memory/sleep_logs/${today}.json`, 'write');
  await fs.writeFile(sleepLogPath, JSON.stringify(snapshot, null, 2));
  console.log(`📝 Sleep snapshot recorded: ${sleepLogPath}`);

  // 2. Synthesis
  console.log('🧠 Synthesizing experiences...');
  const synthesis = await synthesizeExperience(root, today);
  const consolidation = await consolidateEpisodes(root, nowIso);
  await synthesizeNarrative(root, (await loadEpisodicMemory(root)).episodes.slice(-12));
  await reflectSleepCycle(root, {
    day: today,
    telemetryCount: synthesis.eventCount,
    typeCounts: synthesis.typeCounts,
    timestamp: nowIso,
  });
  const adjustments = await reviewBehavioralAdjustments(root, nowIso);
  await reviewMutationSuggestionsForSleep(root, nowIso);
  await maintainExplorationHistory(root, consolidation.summaryKeys, nowIso);
  // Clear staging memory after snapshotting and synthesis.
  try {
    const stagingPath = await PathGuard.validatePath('memory/STAGING_MEMORY.md', 'write');
    await fs.writeFile(stagingPath, ''); // Clear
  } catch {}

  // 3. Reset Daily Budgets
  const mutationStatePath = await PathGuard.validatePath('brain/mutation_state.json', 'write');
  const mutationState = snapshot.mutationState;
  mutationState.mutationsToday = 0;
  mutationState.lastReset = today;
  await fs.writeFile(mutationStatePath, JSON.stringify(mutationState, null, 2));

  const quotasPath = await PathGuard.validatePath('brain/quotas.json', 'write');
  const quotas = snapshot.quotas;
  quotas.tokens.today = 0;
  quotas.tokens.resetDaily = today;
  await fs.writeFile(quotasPath, JSON.stringify(quotas, null, 2));

  console.log('🔄 Daily budgets reset.');

  await persistEnergyState(root, {
    level: 100,
    lowEnergy: false,
    lastUpdatedAt: nowIso,
    tokensUsedToday: 0,
    tokensBudgetDaily: Number(quotas.tokens.maxPerDay || 100000),
  });
  await fs.writeFile(
    await PathGuard.validatePath(HEARTBEAT_FILE, "write"),
    JSON.stringify({ timestamp: nowIso, lowEnergy: false, autoSleepTriggered: false }, null, 2),
  );

  // 4. Evolutionary Commit
  const hasChanges = execSync('git status --porcelain', { cwd: root, encoding: 'utf-8' }).trim().length > 0;
  if (!hasChanges) {
    console.log('🧬 No new changes detected during sleep cycle. Skipping commit.');
    if (adjustments.confidenceDelta !== 0 || adjustments.curiosityDelta !== 0) {
      console.log('🧠 Sleep adjustments applied.');
    }
    console.log('💤 Sleep cycle complete. Hatchling is refreshed.');
    return;
  }

  const gitAdd = spawn('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
  const gitAddCode = await new Promise<number>((resolve) => {
    gitAdd.on('close', (code) => resolve(code ?? 1));
  });
  if (gitAddCode !== 0) {
    throw new Error('Failed to stage sleep cycle changes.');
  }

  const commitMsg = `Sleep Cycle: ${today} - Mutations: ${snapshot.mutationState.mutationsToday}`;
  const gitCommit = spawn('git', ['commit', '-m', commitMsg], { cwd: root, stdio: 'ignore' });
  const gitCommitCode = await new Promise<number>((resolve) => {
    gitCommit.on('close', (code) => resolve(code ?? 1));
  });
  if (gitCommitCode !== 0) {
    throw new Error('Failed to create sleep cycle commit.');
  }

  console.log(`🧬 Evolutionary commit created: "${commitMsg}"`);
  console.log('💤 Sleep cycle complete. Hatchling is refreshed.');
}

if (import.meta.main) {
  sleep().catch(console.error);
}
