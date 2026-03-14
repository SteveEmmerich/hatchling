import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { PathGuard } from "../system/pathGuard.js";
import type { SocialUserProfile } from "../system/social-memory.js";

export interface SocialProfile {
  id: string;
  trust: number;
  interactionCount: number;
  preferences: Record<string, string>;
  facts: Record<string, string>;
  lastSeenAt?: string;
  notes?: string[];
}

export interface SocialMemoryState {
  version: 1;
  users: Record<string, SocialProfile>;
}

const SOCIAL_FILE = "brain/memory/social_memory.json";

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeProfile(profile: SocialProfile): SocialProfile {
  return {
    ...profile,
    trust: Math.max(0, Math.min(100, Number(profile.trust || 0))),
    interactionCount: Math.max(0, Number(profile.interactionCount || 0)),
    preferences: profile.preferences || {},
    facts: profile.facts || {},
    notes: profile.notes || [],
  };
}

export async function loadSocialMemory(rootDir: string): Promise<SocialMemoryState> {
  const target = path.join(rootDir, SOCIAL_FILE);
  if (!existsSync(target)) return { version: 1, users: {} };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as SocialMemoryState;
    if (!parsed || parsed.version !== 1 || typeof parsed.users !== "object") {
      return { version: 1, users: {} };
    }
    const users: Record<string, SocialProfile> = {};
    for (const [key, value] of Object.entries(parsed.users || {})) {
      users[key] = normalizeProfile(value as SocialProfile);
    }
    return { version: 1, users };
  } catch {
    return { version: 1, users: {} };
  }
}

export async function saveSocialMemory(rootDir: string, state: SocialMemoryState): Promise<void> {
  PathGuard.setRoot(rootDir);
  const target = await PathGuard.validatePath(SOCIAL_FILE, "write");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

export async function updateSocialProfile(
  rootDir: string,
  userId: string,
  updates: Partial<SocialProfile>,
): Promise<SocialProfile> {
  const state = await loadSocialMemory(rootDir);
  const key = userId.toLowerCase();
  const existing = state.users[key];
  const next: SocialProfile = normalizeProfile({
    id: key,
    trust: updates.trust ?? existing?.trust ?? 50,
    interactionCount: updates.interactionCount ?? existing?.interactionCount ?? 0,
    preferences: { ...(existing?.preferences || {}), ...(updates.preferences || {}) },
    facts: { ...(existing?.facts || {}), ...(updates.facts || {}) },
    lastSeenAt: updates.lastSeenAt ?? existing?.lastSeenAt ?? nowIso(),
    notes: [...(existing?.notes || []), ...(updates.notes || [])].slice(-20),
  });
  state.users[key] = next;
  await saveSocialMemory(rootDir, state);
  return next;
}

export async function migrateLegacySocialMemory(
  rootDir: string,
  legacy: Record<string, SocialUserProfile>,
): Promise<void> {
  const state = await loadSocialMemory(rootDir);
  for (const [key, profile] of Object.entries(legacy || {})) {
    state.users[key] = normalizeProfile({
      id: key,
      trust: Number(profile.trustScore || 50),
      interactionCount: Number(profile.interactions || 0),
      preferences: {
        verbosity: profile.preferences?.verbosity || "balanced",
        pace: profile.preferences?.pace || "normal",
      },
      facts: {},
      lastSeenAt: profile.lastSeenAt,
      notes: profile.notes || [],
    });
  }
  await saveSocialMemory(rootDir, state);
}
