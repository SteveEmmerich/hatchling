import { PathGuard } from './pathGuard.js';

export class SecurityScanner {

  private static BANNED_PATTERNS = [
    { regex: /eval\s*\(/, name: 'eval()' },
    { regex: /new\s+Function\s*\(/, name: 'new Function()' },
    { regex: /process\.exit/, name: 'process.exit' },
    { regex: /fs\.rm\s*\(/, name: 'fs.rm (use safe deletion)' },
    { regex: /fs\/promises['"]?\)\.rm\s*\(/, name: 'fs.promises.rm' },
    { regex: /chmod\s*\(/, name: 'chmod' },
    { regex: /chown\s*\(/, name: 'chown' },
    { regex: /(?:exec|spawn|execSync|spawnSync)\s*\(\s*`/, name: 'Template literal in exec/spawn (Command Injection Risk)' },
    { regex: /(?:exec|spawn|execSync|spawnSync)\s*\(\s*"\${/, name: 'String interpolation in exec/spawn' },
    { regex: /(?:exec|spawn|execSync|spawnSync)\s*\(\s*'\${/, name: 'String interpolation in exec/spawn' },
    { regex: /sudo\s+/, name: 'sudo usage' }
  ];

  /**
   * Scans code content for lethal patterns.
   * Throws Error if any violations are found.
   */
  static scanCode(code: string, context: string = 'Mutation Candidate'): void {
    const violations: string[] = [];

    this.BANNED_PATTERNS.forEach(pattern => {
      if (pattern.regex.test(code)) {
        violations.push(pattern.name);
      }
    });

    if (violations.length > 0) {
      throw new Error(
        `Security Scan Failed [${context}]: Found banned patterns: ${violations.join(', ')}`
      );
    }
  }

  /**
   * Validates a candidate file before it can be executed or promoted.
   */
  static async validateFile(filePath: string): Promise<void> {
    const validPath = await PathGuard.validatePath(filePath, 'read');
    // Using bun's file API for reading
    const file = Bun.file(validPath);
    const content = await file.text();
    this.scanCode(content, path.basename(filePath));
  }
}
