import { PathGuard } from './pathGuard.js';
import { Telemetry } from './telemetry.js';
import { spawn } from 'child_process';
import path from 'path';

export async function createSnapshot() {
  const today = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `snapshot_${today}.bundle`;
  const root = PathGuard.getAgentRoot();
  
  // Ensure backup dir exists
  const backupDir = await PathGuard.validatePath('memory/backups', 'write');
  const backupPath = path.join(backupDir, filename);

  console.log('💾 Creating system snapshot...');

  const proc = Bun.spawn(['git', 'bundle', 'create', backupPath, 'HEAD', '--all'], { cwd: root });
  const exitCode = await proc.exited;

  if (exitCode === 0) {
    const msg = `Snapshot created: ${filename}`;
    console.log(`✅ ${msg}`);
    Telemetry.info(msg);
  } else {
    const msg = 'Snapshot failed to create bundle';
    console.error(`❌ ${msg}`);
    Telemetry.error(msg);
  }
}

if (import.meta.main) {
  createSnapshot().catch(console.error);
}
