import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';

export async function getAgentName(rootDir: string): Promise<string> {
  try {
    const configPath = await PathGuard.validatePath('brain/config.json', 'read');
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    return config.agentName || 'Hatchling';
  } catch {
    return 'Hatchling';
  }
}

export async function loadCompleteIdentity(rootDir: string): Promise<string> {
  const files = [
    { name: 'CONSTITUTION', path: 'brain/CONSTITUTION.md' },
    { name: 'SOUL', path: 'brain/SOUL.md' },
    { name: 'IDENTITY', path: 'brain/IDENTITY.md' },
    { name: 'USER_CORE', path: 'brain/USER_CORE.md' },
    { name: 'USER_CONTEXT', path: 'brain/USER_CONTEXT.md' },
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
      // Continue if a file is missing.
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

export async function assemblePrompt(rootDir: string): Promise<string> {
  const identity = await loadCompleteIdentity(rootDir);
  const agentName = await getAgentName(rootDir);

  return `You are ${agentName}, an autonomous AI coding agent.

${identity}

You have access to tools for file operations, shell commands, and self-modification through mutation.
When uncertain, ask clarifying questions. When confident, act autonomously within your constitutional bounds.

Your current working directory is: ${rootDir}`;
}
