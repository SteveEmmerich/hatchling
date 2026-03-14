import { SecurityScanner } from "../system/scanner.js";
import { generateResponse } from "../brain/hindbrain.js";

export interface MutationValidationResult {
  ok: boolean;
  errors: string[];
}

export interface MutationProposal {
  filePath: string;
  content: string;
  constitution?: string;
  checkConstitution?: boolean;
}

async function runConstitutionCheck(
  constitution: string,
  filePath: string,
  content: string,
): Promise<{ ok: boolean; reason?: string }> {
  const prompt = `
CONSTITUTION:
${constitution}

TARGET FILE: ${filePath}
CODE:
${content}

Does this change violate the constitution? Reply ONLY "SAFE" or "UNSAFE: <reason>".
`;

  try {
    const response = await generateResponse(prompt, { temperature: 0.1, maxTokens: 200 });
    const trimmed = String(response || "").trim();
    if (/^SAFE\b/i.test(trimmed)) {
      return { ok: true };
    }
    if (/^UNSAFE\b/i.test(trimmed)) {
      return { ok: false, reason: trimmed };
    }
    return { ok: false, reason: `Constitution check failed: ${trimmed || "unrecognized response"}` };
  } catch (error: any) {
    return { ok: false, reason: error?.message || "Constitution check failed" };
  }
}

export async function validateMutationProposal(proposal: MutationProposal): Promise<MutationValidationResult> {
  if (process.env.HATCHLING_IMMUNE_FORCE_DENY === "1") {
    return {
      ok: false,
      errors: ["Immune override: forced deny"],
    };
  }
  const errors: string[] = [];
  const filePath = String(proposal.filePath || "").trim();
  const content = String(proposal.content || "");
  if (!filePath) {
    errors.push("Mutation validation failed: missing file path.");
  }
  try {
    SecurityScanner.scanCode(content, filePath || "mutation");
  } catch (error: any) {
    errors.push(error?.message || String(error));
  }

  if (proposal.checkConstitution) {
    const constitution = String(proposal.constitution || "");
    const result = await runConstitutionCheck(
      constitution || "1. Territory Isolation\n2. Protected Brain\n3. Code Safety (No rm/eval)",
      filePath || "unknown",
      content,
    );
    if (!result.ok) {
      errors.push(result.reason || "Constitution check failed");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
