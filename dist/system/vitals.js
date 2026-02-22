import { PathGuard } from './pathGuard.js';
import { checkHealth } from './health.js';
import { execSync } from 'child_process';
import fs from 'fs/promises';
export async function getVitals() {
    const root = PathGuard.getAgentRoot();
    // 1. Git History (Genetic Age)
    const gitProc = execSync('git rev-list --count HEAD', { cwd: root, encoding: 'utf-8' });
    const commitCount = parseInt(gitProc.trim());
    // 2. Health
    const health = await checkHealth();
    // 3. Mutation State & Success Ratio (Biological Integrity)
    const mutationStatePath = await PathGuard.validatePath('brain/mutation_state.json', 'read');
    const mutationStateContent = await fs.readFile(mutationStatePath, 'utf-8');
    const mutationState = JSON.parse(mutationStateContent);
    const successRatio = mutationState.totalMutations > 0
        ? ((mutationState.successfulMutations / mutationState.totalMutations) * 100).toFixed(1)
        : '0.0';
    // 4. Quotas & Energy (Metabolism)
    const quotasPath = await PathGuard.validatePath('brain/quotas.json', 'read');
    const quotasContent = await fs.readFile(quotasPath, 'utf-8');
    const quotas = JSON.parse(quotasContent);
    const tokenUsagePercent = (quotas.tokens.today / quotas.tokens.maxPerDay) * 100;
    const energyLevel = tokenUsagePercent > 90 ? 'Critical' : tokenUsagePercent > 70 ? 'Low' : 'High';
    // 5. Daemon (Ghost Pulse)
    let daemonStatus = 'Offline';
    try {
        const pidPath = await PathGuard.validatePath('brain/daemon.pid', 'read');
        const pid = await fs.readFile(pidPath, 'utf-8');
        const check = execSync(`kill -0 ${pid.trim()}`, { encoding: 'utf-8' });
        if (check) {
            daemonStatus = `Running (PID: ${pid.trim()})`;
        }
    }
    catch { }
    return `
❤️  HATCHLING VITALS
====================
🧬 Genetic Age:      ${commitCount} commits
🦠 Mutations Today:  ${mutationState.mutationsToday} / 5 (Daily)
🧪 Success Rate:     ${successRatio}%
⚡ Metabolism:       ${energyLevel} (${tokenUsagePercent.toFixed(1)}% Token Usage)
🏥 Biological Integrity: ${health.safeMode ? '⚠️ SAFE MODE' : '✅ Healthy'}
👻 Ghost Pulse:      ${daemonStatus}
💾 Disk Usage:       ${(quotas.disk.current / 1024 / 1024).toFixed(1)} MB / ${(quotas.disk.max / 1024 / 1024 / 1024).toFixed(1)} GB
`.trim();
}
//# sourceMappingURL=vitals.js.map