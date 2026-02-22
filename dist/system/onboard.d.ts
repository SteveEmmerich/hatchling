import type { Identity } from "./identity-schema.js";
export interface OnboardOptions {
    provider: string;
    model: string;
    seedIdentity?: Partial<Identity>;
}
export declare function runSelfDiscovery(options: OnboardOptions): Promise<string>;
//# sourceMappingURL=onboard.d.ts.map