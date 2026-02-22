import { PathGuard } from './pathGuard.js';
import { Telemetry } from './telemetry.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export async function createSnapshot(): Promise<string> {
  const today = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `snapshot_${today}.bundle`;
  const root = PathGuard.getAgentRoot();
  
  // Ensure backup dir exists
  const backupDir = await PathGuard.validatePath('memory/backups', 'write');
  await fs.mkdir(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, filename);

  console.log('💾 Creating system snapshot...');

  const proc = spawn('git', ['bundle', 'create', backupPath, 'HEAD', '--all'], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  proc.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  const exitCode = await new Promise<number>((resolve) => {
    proc.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode === 0) {
    const msg = `Snapshot created: ${filename}`;
    console.log(`✅ ${msg}`);
    Telemetry.info(msg);
    return backupPath;
  } else {
    const msg = `Snapshot failed to create bundle: ${stderr.trim() || 'unknown error'}`;
    console.error(`❌ ${msg}`);
    Telemetry.error(msg);
    throw new Error(msg);
  }
}

if (import.meta.main) {
  createSnapshot().catch(console.error);
}
