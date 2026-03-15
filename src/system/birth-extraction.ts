import { normalizeNameCandidate } from "./identity-co-creation.js";

export interface BirthSeed {
  userName?: string;
  organismName?: string;
  purposeHint?: string;
  personalityHints?: string[];
  collaborationGoals?: string[];
  archetype?: string;
  curiosityBaseline?: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractUserName(text: string): string | undefined {
  const patterns = [
    /\bmy name is\s+([a-zA-Z][a-zA-Z0-9 _-]{1,30})/i,
    /\bi am\s+([a-zA-Z][a-zA-Z0-9 _-]{1,30})/i,
    /\bi'm\s+([a-zA-Z][a-zA-Z0-9 _-]{1,30})/i,
    /\bcall me\s+([a-zA-Z][a-zA-Z0-9 _-]{1,30})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return titleCase(match[1].trim());
    }
  }
  return undefined;
}

function extractOrganismName(text: string): string | undefined {
  const patterns = [
    /\bcall (?:you|it)\s+([a-zA-Z0-9 _-]{2,50})/i,
    /\bname (?:you|it)\s+([a-zA-Z0-9 _-]{2,50})/i,
    /\b(?:your|its)\s+name is\s+([a-zA-Z0-9 _-]{2,50})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;
    const name = normalizeNameCandidate(match[1]);
    if (name) return name;
  }
  return undefined;
}

function extractGoals(text: string): string[] {
  const patterns = [
    /\bwe should\s+([^.!?\n]+)/i,
    /\bi want\s+([^.!?\n]+)/i,
    /\bhelp me\s+([^.!?\n]+)/i,
    /\blet'?s\s+([^.!?\n]+)/i,
  ];
  const goals: string[] = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (candidate.length >= 4) goals.push(candidate);
    }
  }
  return goals.slice(0, 4);
}

function extractArchetype(text: string): string | undefined {
  const patterns = [
    /\blike a[n]?\s+([a-zA-Z0-9 _-]{2,40})/i,
    /\bas a[n]?\s+([a-zA-Z0-9 _-]{2,40})/i,
    /\bmetaphor\s+([a-zA-Z0-9 _-]{2,40})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return undefined;
}

function extractCuriosityBaseline(text: string): number | undefined {
  const lower = text.toLowerCase();
  if (/\bcurious\b|\bexplor/.test(lower)) return 7;
  if (/\bplayful\b|\badventur/.test(lower)) return 8;
  if (/\bcareful\b|\bcautious\b|\bsteady\b/.test(lower)) return 4;
  if (/\bbold\b|\bbrave\b/.test(lower)) return 6;
  return undefined;
}

function extractPersonalityHints(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9,\s-]/g, " ")
    .split(/[,/]|(?:\s+and\s+)|(?:\s+but\s+)/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
  const unique = Array.from(new Set(tokens)).slice(0, 6);
  return unique;
}

export function extractBirthSeed(input: string): Partial<BirthSeed> {
  const text = input.trim();
  if (!text) return {};
  const goals = extractGoals(text);
  return {
    userName: extractUserName(text),
    organismName: extractOrganismName(text),
    purposeHint: goals[0],
    personalityHints: extractPersonalityHints(text),
    collaborationGoals: goals,
    archetype: extractArchetype(text),
    curiosityBaseline: extractCuriosityBaseline(text),
  };
}

export function mergeBirthSeeds(seeds: Array<Partial<BirthSeed>>): BirthSeed {
  const merged: BirthSeed = {};
  for (const seed of seeds) {
    if (!seed) continue;
    if (seed.userName) merged.userName = seed.userName;
    if (seed.organismName) merged.organismName = seed.organismName;
    if (seed.purposeHint) merged.purposeHint = seed.purposeHint;
    if (seed.archetype) merged.archetype = seed.archetype;
    if (typeof seed.curiosityBaseline === "number") {
      merged.curiosityBaseline = clamp(seed.curiosityBaseline, 1, 9);
    }
    if (seed.personalityHints && seed.personalityHints.length > 0) {
      merged.personalityHints = Array.from(new Set([...(merged.personalityHints || []), ...seed.personalityHints]));
    }
    if (seed.collaborationGoals && seed.collaborationGoals.length > 0) {
      merged.collaborationGoals = Array.from(new Set([...(merged.collaborationGoals || []), ...seed.collaborationGoals]));
    }
  }
  return merged;
}
