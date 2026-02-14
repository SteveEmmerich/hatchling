import { PathGuard } from './pathGuard.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

export async function sleep() {
  console.log('🌙 Initiating Sleep Cycle...');

  const today = new Date().toISOString().split('T')[0];
  const root = PathGuard.getAgentRoot();

  // 1. Snapshot State
  const snapshot = {
    date: new Date().toISOString(),
    mutationState: await Bun.file(await PathGuard.validatePath('brain/mutation_state.json', 'read')).json(),
    quotas: await Bun.file(await PathGuard.validatePath('brain/quotas.json', 'read')).json(),
    // Get current git hash
    commitHash: await (async () => {
      const proc = Bun.spawn(['git', 'rev-parse', 'HEAD'], { cwd: root, stdout: 'pipe' });
      return (await new Response(proc.stdout).text()).trim();
    })()
  };

  const sleepLogPath = await PathGuard.validatePath(`memory/sleep_logs/${today}.json`, 'write');
  await fs.writeFile(sleepLogPath, JSON.stringify(snapshot, null, 2));
  console.log(`📝 Sleep snapshot recorded: ${sleepLogPath}`);

  // 2. Synthesis (Placeholder for LLM abstraction)
  console.log('🧠 Synthesizing experiences...');
  // Here we would call the LLM to read STAGING_MEMORY and update EXPERIENCE.md
  // For now, we just clear staging memory
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

  // 4. Evolutionary Commit
  const gitAdd = Bun.spawn(['git', 'add', '.'], { cwd: root });
  await gitAdd.exited;

  const commitMsg = `Sleep Cycle: ${today} - Mutations: ${snapshot.mutationState.mutationsToday}`;
  const gitCommit = Bun.spawn(['git', 'commit', '-m', commitMsg], { cwd: root });
  await gitCommit.exited;

  console.log(`🧬 Evolutionary commit created: "${commitMsg}"`);
  console.log('💤 Sleep cycle complete. Hatchling is refreshed.');
}

if (import.meta.main) {
  sleep().catch(console.error);
}
