import type { AgentTask, AgentStructuredResult } from "./agent_types.js";

export type AgentRunner = (rootDir: string, task: AgentTask) => Promise<AgentStructuredResult>;

const registry = new Map<string, AgentRunner>();

export function registerAgentRunner(type: string, runner: AgentRunner): void {
  registry.set(type, runner);
}

export function getAgentRunner(type: string): AgentRunner {
  const runner = registry.get(type);
  if (!runner) {
    throw new Error(`No agent runner registered for ${type}`);
  }
  return runner;
}

export function listAgentTypes(): string[] {
  return [...registry.keys()];
}
