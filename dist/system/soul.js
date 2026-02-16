import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';
export async function getAgentName(rootDir) {
    try {
        const configPath = await PathGuard.validatePath('brain/config.json', 'read');
        const config = await Bun.file(configPath).json();
        return config.agentName || 'Hatchling';
    }
    catch {
        return 'Hatchling';
    }
}
export async function loadCompleteIdentity(rootDir) {
    const files = [
        { name: 'CONSTITUTION', path: '.self/CONSTITUTION.md' },
        { name: 'SOUL', path: '.self/SOUL.md' },
        { name: 'IDENTITY', path: '.self/IDENTITY.md' },
        { name: 'STYLE', path: '.self/STYLE.md' },
        { name: 'USER_CORE', path: '.self/USER_CORE.md' },
        { name: 'USER_CONTEXT', path: '.self/USER_CONTEXT.md' },
        // EXPERIENCE.md is optional/dynamic
    ];
    let fullIdentity = '';
    for (const file of files) {
        try {
            const filePath = await PathGuard.validatePath(file.path, 'read');
            const content = await fs.readFile(filePath, 'utf-8');
            fullIdentity += `\n\n# ${file.name}\n${content.trim()}`;
        }
        catch (e) {
            if (e.code !== 'ENOENT') {
                console.warn(`Failed to load ${file.name}: ${e.message}`);
            }
            // Continue even if a file is missing (except Constitution ideally, but we handle that loosely here)
        }
    }
    // Attempt to load EXPERIENCE if it exists
    try {
        const expPath = await PathGuard.validatePath('.self/EXPERIENCE.md', 'read');
        const experience = await fs.readFile(expPath, 'utf-8');
        fullIdentity += `\n\n# EXPERIENCE\n${experience.trim()}`;
    }
    catch {
        // No experience yet
    }
    return fullIdentity.trim();
}
export async function assemblePrompt(rootDir) {
    const identity = await loadCompleteIdentity(rootDir);
    const agentName = await getAgentName(rootDir);
    return `You are ${agentName}, an autonomous AI coding agent.

${identity}

You have access to tools for file operations, shell commands, and self-modification through mutation.
When uncertain, ask clarifying questions. When confident, act autonomously within your constitutional bounds.

Your current working directory is: ${rootDir}`;
}
//# sourceMappingURL=soul.js.map