import { PathGuard } from './pathGuard.js';
import { spawn } from 'child_process';
import fs from 'fs/promises';
export async function amputate() {
    console.log('⚠️ INITIATING GENETIC ROLLBACK (AMPUTATION)...');
    const root = PathGuard.getAgentRoot();
    // 1. Reset Git to previous commit (HARD)
    const git = spawn('git', ['reset', '--hard', 'HEAD^'], { cwd: root });
    const exitCode = await new Promise((resolve) => {
        git.on('close', resolve);
    });
    if (exitCode !== 0) {
        throw new Error('Git reset failed. Amputation unsuccessful.');
    }
    console.log('✅ Genetic code reverted to previous state.');
    // 2. Adjust Curiosity (-1)
    const curiosityPath = await PathGuard.validatePath('brain/curiosity_state.json', 'write');
    const curiosityState = await Bun.file(curiosityPath).json();
    if (curiosityState.adjustedCuriosity > 1) {
        curiosityState.adjustedCuriosity -= 1;
        curiosityState.lastCalculated = new Date().toISOString();
        await fs.writeFile(curiosityPath, JSON.stringify(curiosityState, null, 2));
        console.log(`📉 Curiosity dampened to ${curiosityState.adjustedCuriosity} (Trauma Response).`);
    }
    else {
        console.log(`📉 Curiosity already at minimum (1).`);
    }
    // 3. Log Amputation Event
    const logPath = await PathGuard.validatePath('brain/EVOLUTION_LOG.json', 'write');
    const log = await Bun.file(logPath).json();
    log.rollbacks = (log.rollbacks || 0) + 1;
    await fs.writeFile(logPath, JSON.stringify(log, null, 2));
}
if (import.meta.main) {
    amputate().catch(console.error);
}
//# sourceMappingURL=amputate.js.map