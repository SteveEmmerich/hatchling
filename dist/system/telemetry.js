import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';
export class Telemetry {
    static async log(type, message, data) {
        const today = new Date().toISOString().split('T')[0];
        const logFile = `memory/telemetry/${today}.jsonl`;
        // Scrub sensitive data
        const scrubbedMessage = PathGuard.redact(message);
        const scrubbedData = data ? JSON.parse(PathGuard.redact(JSON.stringify(data))) : undefined;
        const entry = {
            timestamp: new Date().toISOString(),
            type,
            message: scrubbedMessage,
            data: scrubbedData
        };
        try {
            const filePath = await PathGuard.validatePath(logFile, 'write');
            await fs.appendFile(filePath, JSON.stringify(entry) + '\n');
            // Also log to console for immediate feedback
            console.log(`[${type.toUpperCase()}] ${scrubbedMessage}`);
        }
        catch (e) {
            console.error(`Failed to write telemetry:`, e);
        }
    }
    static async info(message, data) { return this.log('info', message, data); }
    static async warn(message, data) { return this.log('warn', message, data); }
    static async error(message, data) { return this.log('error', message, data); }
}
// Helper function for external modules that takes instance path
export async function logEvent(instanceDir, type, message, data) {
    const today = new Date().toISOString().split('T')[0];
    const logFile = `${instanceDir}/memory/telemetry/${today}.jsonl`;
    // Scrub sensitive data
    const scrubbedMessage = PathGuard.redact(message);
    const scrubbedData = data ? JSON.parse(PathGuard.redact(JSON.stringify(data))) : undefined;
    const entry = {
        timestamp: new Date().toISOString(),
        type,
        message: scrubbedMessage,
        data: scrubbedData
    };
    try {
        await fs.mkdir(`${instanceDir}/memory/telemetry`, { recursive: true });
        await fs.appendFile(logFile, JSON.stringify(entry) + '\n');
    }
    catch (e) {
        // Silently fail - telemetry shouldn't block execution
    }
}
//# sourceMappingURL=telemetry.js.map