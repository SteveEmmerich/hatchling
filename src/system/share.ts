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
  installerPath: string;
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
    "1. Run installer script:",
    `   bash ${path.basename(result.installerPath)}`,
    "2. Verify startup in imported folder:",
    "   node dist/cli.js start --smoke",
    "",
    "## Notes",
    "- Use control-plane JSON to edit provider/capability setup post-import.",
    "- For daemon mode: `hatchling start --daemon`.",
    "",
  ].join("\n");
}

function installerContent(result: ShareKitResult): string {
  const bundleFile = path.basename(result.bundlePath);
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "KIT_DIR=\"$(cd \"$(dirname \"${BASH_SOURCE[0]}\")\" && pwd)\"",
    `BUNDLE_PATH=\"$KIT_DIR/${bundleFile}\"`,
    "TARGET_DIR=\"${1:-$PWD/hatchling-imported}\"",
    "",
    "if [ ! -f \"$BUNDLE_PATH\" ]; then",
    "  echo \"Bundle not found: $BUNDLE_PATH\" >&2",
    "  exit 1",
    "fi",
    "",
    "if [ -e \"$TARGET_DIR\" ]; then",
    "  echo \"Target already exists: $TARGET_DIR\" >&2",
    "  exit 1",
    "fi",
    "",
    "echo \"Cloning hatchling bundle into $TARGET_DIR\"",
    "git clone \"$BUNDLE_PATH\" \"$TARGET_DIR\"",
    "cd \"$TARGET_DIR\"",
    "",
    "echo \"Installing dependencies\"",
    "npm install",
    "",
    "echo \"Building\"",
    "npm run build --silent || npm run build",
    "",
    "echo \"Linking hatchling CLI globally\"",
    "npm link",
    "",
    "echo \"Install complete. Run: hatchling start --smoke\"",
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
    installerPath: path.join(kitDir, "INSTALL.sh"),
  };

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    instance: instanceName,
    bundle: path.basename(bundlePath),
    quickstart: path.basename(result.quickstartPath),
    installer: path.basename(result.installerPath),
  };
  await fs.writeFile(result.manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  await fs.writeFile(result.installerPath, installerContent(result), "utf-8");
  await fs.chmod(result.installerPath, 0o755);
  await fs.writeFile(result.quickstartPath, quickstartContent(result), "utf-8");
  return result;
}
