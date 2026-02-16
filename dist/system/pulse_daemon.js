import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';
const PULSE_INTERVAL_MS = 60000; // 1 minute (for demo/testing, maybe 10m in prod)
async function getCuriosity() {
    try {
        const path = await PathGuard.validatePath('brain/curiosity_state.json', 'read');
        const state = await Bun.file(path).json();
        return state.adjustedCuriosity;
    }
    catch {
        return 1; // Default low curiosity
    }
}
async function checkActivity() {
    // Check if user is actively interacting (e.g. recent logs)
    // For simplicity, assume idle if no log in last 5 mins
    try {
        const logPath = await PathGuard.validatePath('memory/telemetry/latest.jsonl', 'read');
        const stats = await fs.stat(logPath);
        const timeSinceLastLog = Date.now() - stats.mtimeMs;
        return timeSinceLastLog > 300000; // 5 minutes
    }
    catch {
        return true; // No logs = idle
    }
}
async function performCuriosityAction(level) {
    console.log(`👻 Ghost Pulse Active (Curiosity: ${level})`);
    if (level < 4) {
        console.log('💤 Passive mode: Monitoring only.');
        return;
    }
    // Example action: Suggest a project or check roadmap
    const action = `[Ghost Pulse] Checked roadmap for next steps. Curiosity level ${level} suggests active exploration.`;
    // Log to Staging Memory
    const memoryPath = await PathGuard.validatePath('memory/STAGING_MEMORY.md', 'write');
    await fs.appendFile(memoryPath, `\n- ${new Date().toISOString()}: ${action}`);
}
export async function runPulse() {
    console.log('👻 Ghost Pulse Daemon Started');
    // Write PID
    const pidPath = await PathGuard.validatePath('brain/daemon.pid', 'write');
    await fs.writeFile(pidPath, process.pid.toString());
    setInterval(async () => {
        try {
            const isIdle = await checkActivity();
            if (isIdle) {
                const curiosity = await getCuriosity();
                await performCuriosityAction(curiosity);
            }
        }
        catch (e) {
            console.error('Ghost Pulse Error:', e);
        }
    }, PULSE_INTERVAL_MS);
}
if (import.meta.main) {
    runPulse().catch(console.error);
}
//# sourceMappingURL=pulse_daemon.js.map