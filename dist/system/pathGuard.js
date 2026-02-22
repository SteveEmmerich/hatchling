import path from "path";
import { homedir } from "os";
/**
 * PATH: src/system/pathGuard.ts
 */
export class PathGuard {
    static rootDir = process.env.HATCHLING_INSTANCE_PATH || process.cwd();
    static setRoot(root) {
        this.rootDir = path.resolve(root);
    }
    static getRoot() {
        return this.rootDir;
    }
    // Backward-compatible alias used by older modules.
    static getAgentRoot() {
        return this.getRoot();
    }
    static redact(input) {
        const home = homedir().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return input
            .replace(new RegExp(home, "g"), "~")
            .replace(/(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s]+["']?/gi, "$1=[REDACTED]");
    }
    static async validatePath(requested, op = "read") {
        const absolute = path.isAbsolute(requested)
            ? path.normalize(requested)
            : path.resolve(this.rootDir, requested);
        if (!(absolute === this.rootDir || absolute.startsWith(`${this.rootDir}${path.sep}`))) {
            throw new Error("FIREWALL: Path outside territory.");
        }
        if (op === "write" &&
            path.relative(this.rootDir, absolute).startsWith("brain/")) {
            if (!process.env.HATCHLING_INTERNAL_WRITE)
                throw new Error("FIREWALL: Brain is protected.");
        }
        return absolute;
    }
}
//# sourceMappingURL=pathGuard.js.map