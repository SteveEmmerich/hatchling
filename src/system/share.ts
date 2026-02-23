import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";

export interface ShareKitResult {
  ok: boolean;
  instance: string;
  kitDir: string;
  bundlePath: string;
  manifestPath: string;
  quickstartPath: string;
}

function nowTag(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function runGitBundle(instancePath: string, bundlePath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn("git", ["bundle", "create", bundlePath, "--all"], {
      cwd: instancePath,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git bundle failed: ${stderr.trim() || "unknown error"}`));
      }
    });
  });
}

function quickstartContent(result: ShareKitResult): string {
  return [
    "# Hatchling Share Kit",
    "",
    "## What is included",
    `- Instance bundle: ${path.basename(result.bundlePath)}`,
    "- Control-plane, capabilities, and state files are included in git history.",
    "",
    "## Import on another machine",
    "1. Clone from bundle:",
    `   git clone ${path.basename(result.bundlePath)} hatchling-imported`,
    "2. Enter the project:",
    "   cd hatchling-imported",
    "3. Install dependencies:",
    "   npm install",
    "4. Start in smoke mode:",
    "   node dist/cli.js start --smoke",
    "",
    "## Notes",
    "- Use control-plane JSON to edit provider/capability setup post-import.",
    "- For daemon mode: `hatchling start --daemon`.",
    "",
  ].join("\n");
}

export async function createShareKit(instancePath: string, instanceName: string): Promise<ShareKitResult> {
  const kitDir = path.join(instancePath, "memory", "share-kits", `share_${nowTag()}`);
  await fs.mkdir(kitDir, { recursive: true });

  const bundlePath = path.join(kitDir, `${instanceName}.bundle`);
  await runGitBundle(instancePath, bundlePath);

  const result: ShareKitResult = {
    ok: true,
    instance: instanceName,
    kitDir,
    bundlePath,
    manifestPath: path.join(kitDir, "manifest.json"),
    quickstartPath: path.join(kitDir, "QUICKSTART.md"),
  };

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    instance: instanceName,
    bundle: path.basename(bundlePath),
    quickstart: path.basename(result.quickstartPath),
  };
  await fs.writeFile(result.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  await fs.writeFile(result.quickstartPath, quickstartContent(result), "utf-8");
  return result;
}
