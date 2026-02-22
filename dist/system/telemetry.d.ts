type LogType = 'info' | 'warn' | 'error' | 'mutation' | 'sleep' | 'pulse';
export declare class Telemetry {
    static log(type: LogType, message: string, data?: any): Promise<void>;
    static info(message: string, data?: any): Promise<void>;
    static warn(message: string, data?: any): Promise<void>;
    static error(message: string, data?: any): Promise<void>;
}
export declare function logEvent(instanceDir: string, type: LogType, message: string, data?: any): Promise<void>;
export {};
//# sourceMappingURL=telemetry.d.ts.map