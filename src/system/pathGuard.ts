import path from "path";
import { homedir } from "os";

/**
 * PATH: src/system/pathGuard.ts
 */
export class PathGuard {
  private static rootDir: string = process.env.HATCHLING_INSTANCE_PATH || process.cwd();

  static setRoot(root: string) {
    this.rootDir = path.resolve(root);
  }

  static getRoot(): string {
    return this.rootDir;
  }

  // Backward-compatible alias used by older modules.
  static getAgentRoot(): string {
    return this.getRoot();
  }

  static redact(input: string): string {
    const home = homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return input
      .replace(new RegExp(home, "g"), "~")
      .replace(
        /(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]+["']?/gi,
        "$1=[REDACTED]",
      );
  }

  static async validatePath(
    requested: string,
    op: "read" | "write" = "read",
  ): Promise<string> {
    const absolute = path.isAbsolute(requested)
      ? path.normalize(requested)
      : path.resolve(this.rootDir, requested);

    if (!(absolute === this.rootDir || absolute.startsWith(`${this.rootDir}${path.sep}`))) {
      throw new Error("FIREWALL: Path outside territory.");
    }

    if (
      op === "write" &&
      path.relative(this.rootDir, absolute).startsWith("brain/")
    ) {
      if (!process.env.HATCHLING_INTERNAL_WRITE && process.env.HATCHLING_CONTEXT !== "cli")
        throw new Error("FIREWALL: Brain is protected.");
    }

    return absolute;
  }
}
