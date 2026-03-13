import type { Identity } from "./identity-schema.js";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "be",
  "being",
  "for",
  "help",
  "helps",
  "i",
  "it",
  "its",
  "me",
  "my",
  "name",
  "new",
  "of",
  "or",
  "our",
  "should",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
  "yourself",
  "what",
  "want",
  "based",
  "discussion",
  "think",
  "self",
  "no",
  "do",
  "does",
  "did",
]);

function toNameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/[\s_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .filter((token) => !STOP_WORDS.has(token));
}

export function normalizeNameCandidate(value: string): string {
  const tokens = toNameTokens(value).slice(0, 3);
  return tokens.join("-").slice(0, 50);
}

function extractName(text: string): string | undefined {
  const patterns = [
    /\bname(?:\s+it)?(?:\s+is)?\s+([a-zA-Z0-9 _-]{2,50})\b/i,
    /\bcall(?:\s+it)?\s+([a-zA-Z0-9 _-]{2,50})\b/i,
    /\bnamed\s+([a-zA-Z0-9 _-]{2,50})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;
    const name = normalizeNameCandidate(match[1]);
    if (name) return name;
  }
  return undefined;
}

function cleanupPurpose(value: string): string {
  return value
    .replace(/[$#@!%^&*+=~`|\\/<>{}\[\]]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\W+/, "")
    .replace(/^be\s+/i, "To be ")
    .replace(/^to\s+/i, "To ")
    .trim();
}

function extractPurpose(text: string): string | undefined {
  const patterns = [
    /\bpurpose(?:\s+is)?[:\s]+(.+)/i,
    /\b(?:it|this hatchling)\s+should\s+(.+)/i,
    /\b(?:to|for)\s+([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match || !match[1]) continue;
    const candidate = cleanupPurpose(match[1]);
    if (candidate.length >= 8) return candidate;
  }
  return undefined;
}

function tokenizeTraits(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9,\s-]/g, " ")
    .split(/[,/]|(?:\s+and\s+)|(?:\s+but\s+)/)
    .map((token) => token.trim())
    .flatMap((token) => token.split(/\s+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function extractTraits(text: string): string[] {
  const traitHints = [
    /\btraits?[:\s]+(.+)/i,
    /\bpersonality[:\s]+(.+)/i,
    /\btemperament[:\s]+(.+)/i,
    /\b(?:be|is)\s+([a-z,\s-]{4,})/i,
  ];
  for (const hint of traitHints) {
    const match = text.match(hint);
    if (!match || !match[1]) continue;
    const traits = tokenizeTraits(match[1]);
    if (traits.length > 0) return [...new Set(traits)].slice(0, 8);
  }
  return [];
}

export function parsePersonalityInput(input: string): string[] {
  const raw = input.trim();
  if (!raw) return [];
  const wordCount = raw.split(/\s+/).filter(Boolean).length;
  const isStructured = /,|\/|\band\b|\bbut\b/i.test(raw);
  // Prevent long conversational replies from being mistaken as trait lists.
  if (!isStructured && wordCount > 5) return [];
  const traits = tokenizeTraits(raw);
  return [...new Set(traits)].slice(0, 8);
}

export function suggestNameFromText(input: string): string | undefined {
  return normalizeNameCandidate(input);
}

export function inferIdentityFromNarrative(input: string): Partial<Identity> {
  const trimmed = input.trim();
  if (!trimmed) return {};
  const inferred: Partial<Identity> = {};
  const name = extractName(trimmed);
  if (name) inferred.name = name;
  const purpose = extractPurpose(trimmed);
  if (purpose) inferred.purpose = purpose;
  const personality = extractTraits(trimmed);
  if (personality.length > 0) inferred.personality = personality;
  return inferred;
}
