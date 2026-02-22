/**
 * PATH: src/system/pathGuard.ts
 */
export declare class PathGuard {
    private static rootDir;
    static setRoot(root: string): void;
    static getRoot(): string;
    static getAgentRoot(): string;
    static redact(input: string): string;
    static validatePath(requested: string, op?: "read" | "write"): Promise<string>;
}
//# sourceMappingURL=pathGuard.d.ts.map