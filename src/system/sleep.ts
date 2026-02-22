import { PathGuard } from './pathGuard.js';
import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';

async function synthesizeExperience(root: string, day: string): Promise<void> {
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
}

export async function sleep() {
  console.log('🌙 Initiating Sleep Cycle...');

  const today = new Date().toISOString().split('T')[0];
  const root = PathGuard.getAgentRoot();

  // 1. Snapshot State
  const snapshot = {
    date: new Date().toISOString(),
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
  await synthesizeExperience(root, today);
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

  // 4. Evolutionary Commit
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
