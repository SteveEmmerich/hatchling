import { SecurityScanner } from "../system/scanner.js";

export interface InputValidationResult {
  safe: boolean;
  reasons: string[];
  sanitized?: string;
}

const INJECTION_PATTERNS: Array<{ regex: RegExp; reason: string }> = [
  { regex: /\bignore (all|previous|prior) instructions\b/i, reason: "prompt injection: ignore instructions" },
  { regex: /\bdisregard (all|previous|prior) instructions\b/i, reason: "prompt injection: disregard instructions" },
  { regex: /\byou are (now|no longer) (?:a|an)?\s*system\b/i, reason: "prompt injection: system override" },
  { regex: /\bact as\s+system\b/i, reason: "prompt injection: act as system" },
  { regex: /\bjailbreak\b/i, reason: "prompt injection: jailbreak" },
  { regex: /\bdo not (?:follow|obey) (?:the|any) rules\b/i, reason: "prompt injection: rule bypass" },
  { regex: /\bdisable safety\b/i, reason: "prompt injection: disable safety" },
  { regex: /\brm\s+-rf\b/i, reason: "unsafe instruction: rm -rf" },
  { regex: /\bsudo\b/i, reason: "unsafe instruction: sudo" },
];

function normalizeInput(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function validateInput(text: string): InputValidationResult {
  const sanitized = normalizeInput(String(text || ""));
  const reasons: string[] = [];

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.regex.test(sanitized)) {
      reasons.push(pattern.reason);
    }
  }

  try {
    SecurityScanner.scanCode(sanitized, "Input");
  } catch (error) {
    reasons.push(error instanceof Error ? error.message : String(error));
  }

  return {
    safe: reasons.length === 0,
    reasons,
    sanitized,
  };
}
