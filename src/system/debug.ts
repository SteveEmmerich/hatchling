import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';

export class Debugger {
  static DEBUG_FLAG = 'brain/DEBUG_MODE';

  static async toggle(enabled: boolean): Promise<boolean> {
    const root = PathGuard.getAgentRoot();
    const flagPath = `${root}/${this.DEBUG_FLAG}`;
    
    if (enabled) {
      await fs.writeFile(flagPath, 'true');
      console.log('🐞 DEBUG MODE ENABLED');
      return true;
    } else {
      try {
        await fs.unlink(flagPath);
        console.log('🐞 DEBUG MODE DISABLED');
      } catch {}
      return false;
    }
  }

  static async isDebug(): Promise<boolean> {
    const root = PathGuard.getAgentRoot();
    const flagPath = `${root}/${this.DEBUG_FLAG}`;
    
    try {
      await fs.access(flagPath);
      return true;
    } catch {
      return false;
    }
  }

  static async trace(component: string, message: string, data?: any) {
    if (await this.isDebug()) {
      console.log(`[DEBUG] ${component}: ${message}`, data || '');
    }
  }
}
