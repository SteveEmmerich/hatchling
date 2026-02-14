import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';

interface HealthStatus {
  safeMode: boolean;
  reason?: string;
}

export async function checkHealth(): Promise<HealthStatus> {
  // Check for safe_mode flag file
  try {
    const flagPath = await PathGuard.validatePath('brain/SAFE_MODE', 'read');
    await fs.access(flagPath);
    const content = await fs.readFile(flagPath, 'utf-8');
    return {
      safeMode: true,
      reason: content.trim() || 'Safe mode flag present'
    };
  } catch {
    // Flag doesn't exist, proceed
  }

  // Check mutation state for critical failures (e.g. 3 consecutive rollbacks)
  try {
    const logPath = await PathGuard.validatePath('brain/EVOLUTION_LOG.json', 'read');
    const log = await Bun.file(logPath).json();
    
    // Simplistic heuristic: if rollbacks > 5, enter safe mode? 
    // Maybe too strict for now, but let's just log a warning.
    if (log.rollbacks > 5) {
      console.warn('Warning: High number of genetic rollbacks detected.');
    }
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      // It's fine if log doesn't exist yet (genesis)
    } else {
      console.error('Error checking health logs:', e);
    }
  }

  return { safeMode: false };
}
