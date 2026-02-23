import { PathGuard } from './pathGuard.js';
import { checkHealth } from './health.js';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import { renderCreature } from './creature.js';
import { loadGenome } from './creature-genome.js';
import { loadPersonalityState } from './personality-adaptation.js';

async function readJsonOrDefault<T>(relativePath: string, fallback: T): Promise<T> {
  try {
    const jsonPath = await PathGuard.validatePath(relativePath, 'read');
    const content = await fs.readFile(jsonPath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

export async function getVitals() {
  const root = PathGuard.getAgentRoot();

  // 1. Git History (Genetic Age)
  const gitProc = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf-8' });
  const commitCount = parseInt(gitProc.trim());

  // 2. Health
  const health = await checkHealth();

  // 3. Mutation State & Success Ratio (Biological Integrity)
  const mutationState = await readJsonOrDefault('brain/mutation_state.json', {
    mutationsToday: 0,
    totalMutations: 0,
    successfulMutations: 0,
    sleepCycles: 0,
  });
  const successRatio = mutationState.totalMutations > 0
    ? ((mutationState.successfulMutations / mutationState.totalMutations) * 100).toFixed(1)
    : '0.0';

  // 4. Quotas & Energy (Metabolism)
  const quotas = await readJsonOrDefault('brain/quotas.json', {
    tokens: { today: 0, maxPerDay: 100000 },
    disk: { current: 0, max: 1024 * 1024 * 1024 },
  });
  const tokenUsagePercent = (quotas.tokens.today / quotas.tokens.maxPerDay) * 100;
  const energyLevel = tokenUsagePercent > 90 ? 'Critical' : tokenUsagePercent > 70 ? 'Low' : 'High';
  const heartbeat = await readJsonOrDefault('brain/heartbeat.json', {
    lowEnergy: false,
  });
  const curiosity = await readJsonOrDefault('brain/curiosity_state.json', {
    adjustedCuriosity: 5,
  });
  const config = await readJsonOrDefault('brain/config.json', {
    name: 'hatchling',
    createdAt: '',
  });

  // 5. Daemon (Ghost Pulse)
  let daemonStatus = 'Offline';
  try {
    const daemonStatePath = await PathGuard.validatePath('brain/daemon_state.json', 'read');
    const daemonState = JSON.parse(await fs.readFile(daemonStatePath, 'utf-8'));
    const pid = Number(daemonState.pid || 0);
    if (pid > 0) {
      execSync(`kill -0 ${pid}`, { encoding: 'utf-8' });
      daemonStatus = `Running (PID: ${pid})`;
    }
  } catch {}

  const genome = await loadGenome(
    root,
    `${config.name || 'hatchling'}:${config.createdAt || root}`,
  );
  const personality = await loadPersonalityState(root);
  const personalityLabel = [
    ...personality.baseTraits.slice(0, 3),
    ...personality.adaptiveTraits.slice(0, 2),
  ].join(", ");
  const creature = renderCreature({
    seed: `${config.name || 'hatchling'}:${config.createdAt || root}`,
    commitCount,
    sleepCycles: Number(mutationState.sleepCycles || 0),
    successfulMutations: Number(mutationState.successfulMutations || 0),
    totalMutations: Number(mutationState.totalMutations || 0),
    curiosity: Number(curiosity.adjustedCuriosity || 5),
    energyLevel,
    safeMode: Boolean(health.safeMode),
    lowEnergy: Boolean(heartbeat.lowEnergy),
    palette: genome.palette,
    body: genome.body,
    eyes: genome.eyes,
    accent: genome.accent,
  });
  const creatureBlock = creature.lines.map((line) => `   ${line}`).join('\n');

  return `
❤️  HATCHLING VITALS
====================
🧸 Creature:         ${creature.stage} (${creature.mood}) ${creature.variantId}
${creatureBlock}
🧬 Genetic Age:      ${commitCount} commits
🦠 Mutations Today:  ${mutationState.mutationsToday} / 5 (Daily)
🧪 Success Rate:     ${successRatio}%
🧠 Personality:      ${personalityLabel || "curious"}
⚡ Metabolism:       ${energyLevel} (${tokenUsagePercent.toFixed(1)}% Token Usage)
🏥 Biological Integrity: ${health.safeMode ? '⚠️ SAFE MODE' : '✅ Healthy'}
👻 Ghost Pulse:      ${daemonStatus}
💾 Disk Usage:       ${(quotas.disk.current / 1024 / 1024).toFixed(1)} MB / ${(quotas.disk.max / 1024 / 1024 / 1024).toFixed(1)} GB
`.trim();
}
