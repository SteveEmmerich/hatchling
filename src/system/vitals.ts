import { PathGuard } from './pathGuard.js';
import { checkHealth } from './health.js';

export async function getVitals() {
  const root = PathGuard.getAgentRoot();
  
  // 1. Git History
  const gitProc = Bun.spawn(['git', 'rev-list', '--count', 'HEAD'], { cwd: root, stdout: 'pipe' });
  const commitCount = parseInt((await new Response(gitProc.stdout).text()).trim());

  // 2. Health
  const health = await checkHealth();

  // 3. Mutation State & Success Ratio
  const mutationState = await Bun.file(await PathGuard.validatePath('brain/mutation_state.json', 'read')).json();
  const successRatio = mutationState.totalMutations > 0 
    ? ((mutationState.successfulMutations / mutationState.totalMutations) * 100).toFixed(1)
    : '0.0';

  // 4. Quotas & Energy
  const quotas = await Bun.file(await PathGuard.validatePath('brain/quotas.json', 'read')).json();
  const tokenUsagePercent = (quotas.tokens.today / quotas.tokens.maxPerDay) * 100;
  const energyLevel = tokenUsagePercent > 90 ? 'Critical' : tokenUsagePercent > 70 ? 'Low' : 'High';

  // 5. Daemon
  let daemonStatus = 'Offline';
  try {
    const pidPath = await PathGuard.validatePath('brain/daemon.pid', 'read');
    const pid = await Bun.file(pidPath).text();
    // Check if process running (kill -0)
    const check = Bun.spawn(['kill', '-0', pid.trim()]);
    if ((await check.exited) === 0) {
      daemonStatus = `Running (PID: ${pid.trim()})`;
    }
  } catch {}

  return `
❤️  HATCHLING VITALS
====================
🧬 Age (Commits):    ${commitCount}
🦠 Mutations:        ${mutationState.mutationsToday} / 5 (Daily)
🧪 Success Rate:     ${successRatio}%
⚡ Energy:           ${energyLevel} (${tokenUsagePercent.toFixed(1)}% Usage)
🏥 Health Status:    ${health.safeMode ? '⚠️ SAFE MODE' : '✅ Healthy'}
👻 Ghost Pulse:      ${daemonStatus}
💾 Disk Usage:       ${(quotas.disk.current / 1024 / 1024).toFixed(1)} MB
`.trim();
}
