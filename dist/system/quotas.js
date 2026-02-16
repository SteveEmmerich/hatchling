import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';
import { Telemetry } from './telemetry.js';
export class QuotaManager {
    static async getQuotas() {
        const path = await PathGuard.validatePath('brain/quotas.json', 'read');
        return await Bun.file(path).json();
    }
    static async checkTokenQuota(amount) {
        const quotas = await this.getQuotas();
        if (quotas.tokens.today + amount > quotas.tokens.maxPerDay) {
            throw new Error(`Token Quota Exceeded: Daily limit ${quotas.tokens.maxPerDay} reached.`);
        }
    }
    static async recordTokenUsage(amount) {
        const path = await PathGuard.validatePath('brain/quotas.json', 'write');
        const quotas = await Bun.file(path).json();
        quotas.tokens.today += amount;
        quotas.tokens.month += amount;
        await fs.writeFile(path, JSON.stringify(quotas, null, 2));
        // Not logging every token usage to telemetry to avoid noise, but maybe batch?
    }
    static async checkDiskUsage() {
        const root = PathGuard.getAgentRoot();
        const proc = Bun.spawn(['du', '-sm', root], { stdout: 'pipe' });
        const output = await new Response(proc.stdout).text();
        const sizeMB = parseInt(output.split('\t')[0]);
        const quotas = await this.getQuotas();
        const limitMB = quotas.disk.max / (1024 * 1024); // Convert bytes to MB
        if (sizeMB > limitMB) {
            const msg = `Disk Quota Critical: Using ${sizeMB}MB (Limit: ${limitMB}MB)`;
            Telemetry.warn(msg);
            // In strict mode, we might throw, but for now just warn
        }
        // Update current usage in state
        const path = await PathGuard.validatePath('brain/quotas.json', 'write');
        quotas.disk.current = sizeMB * 1024 * 1024;
        await fs.writeFile(path, JSON.stringify(quotas, null, 2));
    }
    static async isLowEnergy() {
        const quotas = await this.getQuotas();
        const tokenUsagePercent = (quotas.tokens.today / quotas.tokens.maxPerDay) * 100;
        return tokenUsagePercent > 80; // "Low Energy" if > 80% usage
    }
}
//# sourceMappingURL=quotas.js.map