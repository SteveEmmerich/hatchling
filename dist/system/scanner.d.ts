export declare class SecurityScanner {
    private static BANNED_PATTERNS;
    /**
     * Scans code content for lethal patterns.
     * Throws Error if any violations are found.
     */
    static scanCode(code: string, context?: string): void;
    /**
     * Validates a candidate file before it can be executed or promoted.
     */
    static validateFile(filePath: string): Promise<void>;
}
//# sourceMappingURL=scanner.d.ts.map