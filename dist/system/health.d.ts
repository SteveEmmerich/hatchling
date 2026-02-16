interface HealthStatus {
    safeMode: boolean;
    reason?: string;
}
export declare function enterSafeMode(reason: string): Promise<void>;
export declare function exitSafeMode(): Promise<void>;
export declare function checkHealth(): Promise<HealthStatus>;
export {};
//# sourceMappingURL=health.d.ts.map