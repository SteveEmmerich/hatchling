export declare class QuotaManager {
    static getQuotas(): Promise<any>;
    static checkTokenQuota(amount: number): Promise<void>;
    static recordTokenUsage(amount: number): Promise<void>;
    static checkDiskUsage(): Promise<void>;
    static isLowEnergy(): Promise<boolean>;
}
//# sourceMappingURL=quotas.d.ts.map