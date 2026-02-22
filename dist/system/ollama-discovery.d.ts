/**
 * Direct Ollama integration for self-discovery conversation
 * Bypasses pi-agent-core to use Ollama SDK directly
 * Falls back to Hindbrain if Ollama is unavailable
 */
/**
 * Get available Ollama models dynamically
 */
export declare function getAvailableModels(): Promise<Array<{
    name: string;
    label: string;
}>>;
export declare function runOllamaDiscovery(modelId: string, suggestedName: string, rootDir: string): Promise<{
    name: string;
    purpose: string;
    personality: string;
    values: string[];
    preferences: string[];
}>;
//# sourceMappingURL=ollama-discovery.d.ts.map