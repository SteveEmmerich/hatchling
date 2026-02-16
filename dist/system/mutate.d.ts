interface MutationManifest {
    name: string;
    description: string;
    version: string;
    dependencies: {
        [key: string]: string;
    };
    entryPoint: string;
}
export declare class MutationEngine {
    static getMutationBudget(): Promise<number>;
    static useMutationBudget(name: string): Promise<void>;
    static stageMutation(code: string, manifest: MutationManifest): Promise<string>;
}
export {};
//# sourceMappingURL=mutate.d.ts.map