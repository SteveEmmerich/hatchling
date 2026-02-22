import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';
import { Telemetry } from './telemetry.js';
import { execSync } from 'child_process';

export class QuotaManager {

  static async getQuotas() {
    const path = await PathGuard.validatePath('brain/quotas.json', 'read');
    const quotasContent = await fs.readFile(path, 'utf-8');
    return JSON.parse(quotasContent);
  }

  static async checkTokenQuota(amount: number): Promise<void> {
    const quotas = await this.getQuotas();
    if (quotas.tokens.today + amount > quotas.tokens.maxPerDay) {
      throw new Error(`Token Quota Exceeded: Daily limit ${quotas.tokens.maxPerDay} reached.`);
    }
  }

  static async recordTokenUsage(amount: number): Promise<void> {
    const path = await PathGuard.validatePath('brain/quotas.json', 'write');
    const quotasContent = await fs.readFile(path, 'utf-8');
    const quotas = JSON.parse(quotasContent);

    quotas.tokens.today += amount;
    quotas.tokens.month += amount;

    await fs.writeFile(path, JSON.stringify(quotas, null, 2));
    // Not logging every token usage to telemetry to avoid noise, but maybe batch?
  }

  static async checkDiskUsage(): Promise<void> {
    const root = PathGuard.getAgentRoot();
    const output = execSync(`du -sm "${root}"`, { encoding: 'utf-8' });
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

  static async isLowEnergy(): Promise<boolean> {
    const quotas = await this.getQuotas();
    const tokenUsagePercent = (quotas.tokens.today / quotas.tokens.maxPerDay) * 100;
    return tokenUsagePercent > 80; // "Low Energy" if > 80% usage
  }
}
