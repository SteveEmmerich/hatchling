import { PathGuard } from './pathGuard.js';
import fs from 'fs/promises';
export async function loadMemory() {
    try {
        const memoryDir = await PathGuard.validatePath('memory/daily', 'read');
        // Get the most recent daily logs (e.g., last 3)
        const files = await fs.readdir(memoryDir);
        const recentFiles = files.sort().reverse().slice(0, 3);
        let memoryContent = '';
        for (const file of recentFiles) {
            if (file.endsWith('.md')) {
                const filePath = await PathGuard.validatePath(`memory/daily/${file}`, 'read');
                const content = await fs.readFile(filePath, 'utf-8');
                memoryContent += `\n\n### Daily Log: ${file.replace('.md', '')}\n${content.trim()}`;
            }
        }
        // Also include any Staging Memory (from ghost pulse)
        try {
            const stagingPath = await PathGuard.validatePath('memory/STAGING_MEMORY.md', 'read');
            const stagingContent = await fs.readFile(stagingPath, 'utf-8');
            if (stagingContent.trim()) {
                memoryContent += `\n\n### Staging Memory (Current Session)\n${stagingContent.trim()}`;
            }
        }
        catch {
            // No staging memory yet
        }
        return memoryContent.trim() || 'No recent memory.';
    }
    catch (e) {
        if (e.code !== 'ENOENT') {
            console.warn('Failed to load memory:', e.message);
        }
        return 'Memory initialization pending.';
    }
}
//# sourceMappingURL=memory.js.map