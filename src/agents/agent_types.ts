import crypto from "node:crypto";

export type AgentType =
  | "code_analyzer"
  | "test_runner"
  | "researcher"
  | "doc_writer"
  | "experimenter";

export type AgentStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "terminated";

export interface AgentTask {
  id: string;
  type: AgentType;
  goal: string;
  createdAt: string;
  status: AgentStatus;
  allowed_tools: string[];
  time_limit: number;
  parent: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface AgentResult {
  id: string;
  agentId: string;
  status: AgentStatus;
  output: string;
  createdAt: string;
  finishedAt: string;
}

export interface AgentHistoryEntry {
  id: string;
  type: AgentType;
  goal: string;
  createdAt: string;
  status: AgentStatus;
  startedAt?: string;
  finishedAt?: string;
  resultId?: string;
  error?: string;
  parent: string;
}

export interface AgentState {
  active: AgentTask[];
  results: AgentResult[];
  history: AgentHistoryEntry[];
}

export interface AgentTaskInput {
  type: AgentType;
  goal: string;
  allowed_tools?: string[];
  time_limit?: number;
  parent?: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function createAgentTask(input: AgentTaskInput, now: Date = new Date()): AgentTask {
  if (!input || typeof input !== "object") {
    throw new Error("Agent task input is required.");
  }
  const goal = String(input.goal || "").trim();
  if (!goal) {
    throw new Error("Agent goal is required.");
  }
  const type = input.type;
  if (!type) {
    throw new Error("Agent type is required.");
  }
  const allowed_tools = Array.isArray(input.allowed_tools)
    ? input.allowed_tools.map((tool) => String(tool)).filter(Boolean)
    : [];
  const time_limit = clamp(Number(input.time_limit ?? 60000), 1000, 60 * 60 * 1000);
  const createdAt = now.toISOString();
  return {
    id: crypto.randomUUID(),
    type,
    goal,
    createdAt,
    status: "queued",
    allowed_tools,
    time_limit,
    parent: String(input.parent || "organism"),
  };
}
