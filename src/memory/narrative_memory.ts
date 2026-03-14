import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";

const NARRATIVE_FILE = "brain/memory/narrative.md";

function nowIso(): string {
  return new Date().toISOString();
}

export async function loadNarrative(rootDir: string): Promise<string> {
  const target = path.join(rootDir, NARRATIVE_FILE);
  if (!existsSync(target)) return "";
  try {
    return await fs.readFile(target, "utf-8");
  } catch {
    return "";
  }
}

export async function appendNarrative(
  rootDir: string,
  entry: string,
): Promise<void> {
  const trimmed = String(entry || "").trim();
  if (!trimmed) return;
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(NARRATIVE_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  const line = `- ${nowIso()}: ${trimmed}\n`;
  await fs.appendFile(target, line, "utf-8");
}
