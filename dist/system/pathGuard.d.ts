export declare class ProtectedFileError extends Error {
    constructor(filePath: string);
}
export declare class PathGuard {
    static isProtected(relativePath: string): boolean;
    /**
     * Validate and resolve a path for filesystem operations.
     * Ensures the path is inside the agent territory and not protected (for writes).
     */
    static validatePath(requestedPath: string, operation?: 'read' | 'write'): Promise<string>;
    /**
     * Redact sensitive information from logs or output.
     */
    static redact(content: string): string;
}
//# sourceMappingURL=pathGuard.d.ts.map