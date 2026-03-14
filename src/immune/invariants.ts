export interface InvariantCheck {
  name: string;
  ok: boolean;
  reason?: string;
}

export interface InvariantContext {
  protectedPaths?: string[];
  requestedPath?: string;
  mutationValidated?: boolean;
  immuneBypassAttempted?: boolean;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function checkInvariants(context: InvariantContext = {}): InvariantCheck[] {
  const checks: InvariantCheck[] = [];
  const protectedPaths = context.protectedPaths ?? ["brain/", "memory/"];
  const requested = context.requestedPath ? normalizePath(context.requestedPath) : "";

  if (requested) {
    const blocked = protectedPaths.some((prefix) => normalizePath(requested).startsWith(normalizePath(prefix)));
    checks.push({
      name: "protected_boundaries",
      ok: !blocked,
      reason: blocked ? "Path targets protected territory." : undefined,
    });
  } else {
    checks.push({
      name: "protected_boundaries",
      ok: true,
    });
  }

  checks.push({
    name: "mutation_validated",
    ok: context.mutationValidated !== false,
    reason: context.mutationValidated === false ? "Mutation validation missing." : undefined,
  });

  checks.push({
    name: "immune_bypass",
    ok: context.immuneBypassAttempted !== true,
    reason: context.immuneBypassAttempted ? "Immune system bypass attempted." : undefined,
  });

  return checks;
}
