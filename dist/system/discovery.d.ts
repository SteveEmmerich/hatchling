export interface ConversationData {
    name: string;
    purpose: string;
    values: string[];
    communicationStyle: string;
    capabilities: string[];
    userFacts: {
        name?: string;
        role?: string;
        preferences?: string[];
    };
}
export declare function runDiscoveryConversation(provider: string, model: string, rootDir: string): Promise<ConversationData | null>;
export declare function runInteractiveDiscovery(provider: string, model: string, rootDir: string): Promise<ConversationData>;
//# sourceMappingURL=discovery.d.ts.map