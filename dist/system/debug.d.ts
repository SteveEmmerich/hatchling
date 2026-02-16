export declare class Debugger {
    static DEBUG_FLAG: string;
    static toggle(enabled: boolean): Promise<boolean>;
    static isDebug(): Promise<boolean>;
    static trace(component: string, message: string, data?: any): Promise<void>;
}
//# sourceMappingURL=debug.d.ts.map