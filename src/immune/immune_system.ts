import { validateFilesystemAccess, type FilesystemValidationResult } from "./filesystem_guard.js";
import { validateInput, type InputValidationResult } from "./input_validator.js";
import { validateMutationProposal, type MutationProposal, type MutationValidationResult } from "./mutation_validator.js";
import { checkInvariants, type InvariantCheck, type InvariantContext } from "./invariants.js";

export interface ImmuneSystem {
  validateInput: (text: string) => InputValidationResult;
  validateFilesystemAccess: (
    rootDir: string,
    requestedPath: string,
    op?: "read" | "write",
  ) => Promise<FilesystemValidationResult>;
  validateMutationProposal: (proposal: MutationProposal) => Promise<MutationValidationResult>;
  checkInvariants: (context?: InvariantContext) => InvariantCheck[];
}

export interface ImmuneGate {
  allowed: boolean;
  reason?: string;
  source?: string;
}

export const immuneSystem: ImmuneSystem = {
  validateInput,
  validateFilesystemAccess,
  validateMutationProposal,
  checkInvariants,
};

export function toGateResult(result: { ok?: boolean; safe?: boolean; errors?: string[]; reasons?: string[] }, source: string): ImmuneGate {
  const ok = result.ok ?? result.safe ?? true;
  const errors = result.errors ?? result.reasons ?? [];
  return {
    allowed: Boolean(ok),
    reason: !ok && errors.length > 0 ? errors[0] : undefined,
    source,
  };
}

export {
  validateInput,
  validateFilesystemAccess,
  validateMutationProposal,
  checkInvariants,
  type FilesystemValidationResult,
  type InputValidationResult,
  type MutationProposal,
  type MutationValidationResult,
  type InvariantCheck,
  type InvariantContext,
};
