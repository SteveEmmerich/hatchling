import type { Identity } from "./identity-schema";
/**
 * Run interactive discovery conversation to define agent identity
 * Falls back to hindbrain if external provider fails
 */
export declare function runInteractiveDiscovery(provider: string, model: string, seedIdentity?: Partial<Identity>): Promise<Identity>;
//# sourceMappingURL=discovery.d.ts.map