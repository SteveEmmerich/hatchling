import path from 'path';
import fs from 'fs/promises';

const PROTECTED_FILES = [
  'brain/CONSTITUTION.md',
  'brain/SOUL.md',
  'brain/IDENTITY.md',
  'brain/STYLE.md',
  'brain/USER_CORE.md'
];

export class ProtectedFileError extends Error {
  constructor(filePath: string) {
    super(`Access Denied: ${filePath} is a constitutionally protected file.`);
    this.name = 'ProtectedFileError';
  }
}

export class PathGuard {
  
  static isProtected(relativePath: string): boolean {
    // Normalize path separators for cross-platform check
    const normalized = relativePath.split(path.sep).join('/');
    return PROTECTED_FILES.includes(normalized);
  }

  /**
   * Validate and resolve a path for filesystem operations.
   * Ensures the path is inside the agent territory and not protected (for writes).
   */
  static async validatePath(
    rootDir: string,
    requestedPath: string,
    operation: 'read' | 'write' = 'read'
  ): Promise<string> {
    
    // 1. Resolve to absolute path
    const absolute = path.isAbsolute(requestedPath)
      ? path.normalize(requestedPath)
      : path.resolve(rootDir, requestedPath);
    
    // 2. Ensure it's inside the territory
    if (!absolute.startsWith(rootDir)) {
      throw new Error(`Access Denied: Path ${absolute} is outside territory ${rootDir}`);
    }

    // 3. Resolve any symlinks (real path check)
    // We only check this for existing files to prevent symlink attacks
    try {
      const realPath = await fs.realpath(absolute);
      if (!realPath.startsWith(rootDir)) {
        throw new Error(`Access Denied: Symlink ${absolute} points outside territory`);
      }
    } catch (error: any) {
      // If file doesn't exist, we can't check realpath, but that's fine for new files
      // providing the parent directory is valid.
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // 4. Check protected files (Write operation only)
    if (operation === 'write') {
      const relative = path.relative(rootDir, absolute);
      if (this.isProtected(relative)) {
        throw new ProtectedFileError(relative);
      }
    }

    return absolute;
  }

  /**
   * Redact sensitive information from logs or output.
   */
  static redact(content: string): string {
    // Basic patterns for API keys and tokens
    const patterns = [
      /sk-[a-zA-Z0-9]{20,}/g,           // OpenAI / Generic sk- keys
      /ghp_[a-zA-Z0-9]{20,}/g,          // GitHub Personal Access Tokens
      /xox[baprs]-[a-zA-Z0-9]{10,}/g,   // Slack tokens
      /eyJ[a-zA-Z0-9\-_]+\.eyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+/g // JWTs
    ];

    let redacted = content;
    for (const pattern of patterns) {
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
  }
}
