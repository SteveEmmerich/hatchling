interface VectorEntry {
    text: string;
    vector: number[];
    metadata?: any;
}
export declare class VectorMemory {
    static loadStore(): Promise<VectorEntry[]>;
    static embed(text: string): Promise<number[]>;
    static store(text: string, metadata?: any): Promise<void>;
    static recall(query: string, limit?: number): Promise<string[]>;
}
export {};
//# sourceMappingURL=vector_memory.d.ts.map