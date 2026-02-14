import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';

export async function getAgentName(): Promise<string> {
  try {
    const configPath = await PathGuard.validatePath('brain/config.json', 'read');
    const config = await Bun.file(configPath).json();
    return config.agentName || 'Hatchling';
  } catch {
    return 'Hatchling';
  }
}

export async function loadCompleteIdentity(): Promise<string> {
  const files = [
    { name: 'CONSTITUTION', path: 'brain/CONSTITUTION.md' },
    { name: 'SOUL', path: 'brain/SOUL.md' },
    { name: 'IDENTITY', path: 'brain/IDENTITY.md' },
    { name: 'STYLE', path: 'brain/STYLE.md' },
    { name: 'USER_CORE', path: 'brain/USER_CORE.md' },
    { name: 'USER_CONTEXT', path: 'brain/USER_CONTEXT.md' },
    // EXPERIENCE.md is optional/dynamic
  ];

  let fullIdentity = '';

  for (const file of files) {
    try {
      const filePath = await PathGuard.validatePath(file.path, 'read');
      const content = await fs.readFile(filePath, 'utf-8');
      fullIdentity += `\n\n# ${file.name}\n${content.trim()}`;
    } catch (e: any) {
      if (e.code !== 'ENOENT') {
        console.warn(`Failed to load ${file.name}: ${e.message}`);
      }
      // Continue even if a file is missing (except Constitution ideally, but we handle that loosely here)
    }
  }

  // Attempt to load EXPERIENCE if it exists
  try {
    const expPath = await PathGuard.validatePath('brain/EXPERIENCE.md', 'read');
    const experience = await fs.readFile(expPath, 'utf-8');
    fullIdentity += `\n\n# EXPERIENCE\n${experience.trim()}`;
  } catch {
    // No experience yet
  }

  return fullIdentity.trim();
}
