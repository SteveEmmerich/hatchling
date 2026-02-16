/**
 * Direct Ollama integration for self-discovery conversation
 * Bypasses pi-agent-core to use Ollama SDK directly
 */
export declare function runOllamaDiscovery(modelId: string, suggestedName: string, rootDir: string): Promise<{
    name: string;
    purpose: string;
    personality: string;
    values: string[];
    preferences: string[];
}>;
//# sourceMappingURL=ollama-discovery.d.ts.map