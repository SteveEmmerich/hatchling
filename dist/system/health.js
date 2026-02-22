import { PathGuard } from "./pathGuard.js";
import fs from "fs/promises";
export async function enterSafeMode(reason) {
    const flagPath = await PathGuard.validatePath("brain/SAFE_MODE", "write");
    await fs.writeFile(flagPath, reason, "utf-8");
    console.warn(`⚠️  Safe Mode activated: ${reason}`);
}
export async function exitSafeMode() {
    try {
        const flagPath = await PathGuard.validatePath("brain/SAFE_MODE", "write");
        await fs.unlink(flagPath);
        console.log("✓ Safe Mode deactivated");
    }
    catch (e) {
        if (e.code !== "ENOENT") {
            throw e;
        }
    }
}
export async function checkHealth() {
    // Check for safe_mode flag file
    try {
        const flagPath = await PathGuard.validatePath("brain/SAFE_MODE", "read");
        await fs.access(flagPath);
        const content = await fs.readFile(flagPath, "utf-8");
        return {
            safeMode: true,
            reason: content.trim() || "Safe mode flag present",
        };
    }
    catch {
        // Flag doesn't exist, proceed
    }
    // Check mutation state for critical failures (e.g. 3 consecutive rollbacks)
    try {
        const logPath = await PathGuard.validatePath("brain/EVOLUTION_LOG.json", "read");
        // Read and parse JSON file using fs/promises (Node.js compatible)
        const logContent = await fs.readFile(logPath, "utf-8");
        const log = JSON.parse(logContent);
        // Simplistic heuristic: if rollbacks > 5, enter safe mode?
        // Maybe too strict for now, but let's just log a warning.
        if (log.rollbacks > 5) {
            console.warn("Warning: High number of genetic rollbacks detected.");
        }
    }
    catch (e) {
        if (e.code === "ENOENT") {
            // It's fine if log doesn't exist yet (genesis)
        }
        else {
            console.error("Error checking health logs:", e);
        }
    }
    return { safeMode: false };
}
//# sourceMappingURL=health.js.map