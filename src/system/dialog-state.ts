import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { SupportedChannel } from "./channels.js";

const DIALOG_STATE_FILE = "brain/dialog_state.json";

export interface DialogSession {
  id: string;
  channel: SupportedChannel;
  sender: string;
  turns: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastIntent: string;
  objectiveSummary: string;
  openQuestion?: string;
  recentMessages: string[];
  objectives: DialogObjective[];
  thread: {
    objectiveId?: string;
    objective: string;
    stage: "scoping" | "planning" | "executing" | "verifying" | "completed";
    nextStep: string;
    completedAt?: string;
  };
}

export interface DialogObjective {
  id: string;
  text: string;
  status: "pending" | "active" | "completed";
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface DialogState {
  version: 1;
  sessions: Record<string, DialogSession>;
}

export interface DialogTurnPlan {
  session: DialogSession;
  followUpQuestion?: string;
  objectiveSummary: string;
  progressLabel: string;
  nextStep: string;
  activeObjective: string;
  pendingObjectives: number;
  completedObjectives: number;
}

function dialogStatePath(rootDir: string): string {
  return path.join(rootDir, DIALOG_STATE_FILE);
}

function sessionKey(channel: SupportedChannel, sender: string): string {
  return `${channel}:${sender}`.toLowerCase();
}

function classifyIntent(text: string): string {
  const lower = text.toLowerCase();
  if (/\binstall\b|\bsetup\b|\bconfigure\b/.test(lower)) return "setup";
  if (/\bbuild\b|\bcreate\b|\badd\b|\bmake\b/.test(lower)) return "build";
  if (/\bfix\b|\brepair\b|\bdebug\b/.test(lower)) return "repair";
  if (/\bhelp\b|\bsupport\b/.test(lower)) return "help";
  if (/\bstatus\b|\bcheck\b|\bhealth\b/.test(lower)) return "status";
  return "general";
}

function inferObjectiveSummary(text: string, previous: string): string {
  const trimmed = text.trim();
  if (trimmed.length >= 16) return trimmed.slice(0, 180);
  if (previous) return previous;
  return trimmed || "unspecified objective";
}

function inferStage(text: string, prior: DialogSession["thread"]["stage"]): DialogSession["thread"]["stage"] {
  const lower = text.toLowerCase();
  if (/\bdone\b|\bcompleted\b|\bworks now\b|\bfixed\b/.test(lower)) return "completed";
  if (/\btest\b|\bverify\b|\bcheck\b/.test(lower)) return "verifying";
  if (/\bimplement\b|\bbuild\b|\bcreate\b|\badd\b/.test(lower)) return "executing";
  if (/\bplan\b|\bapproach\b|\bdesign\b/.test(lower)) return "planning";
  if (prior === "completed") return "verifying";
  return prior;
}

function inferNextStep(stage: DialogSession["thread"]["stage"], objectiveSummary: string): string {
  if (stage === "scoping") return "clarify success criteria and target files";
  if (stage === "planning") return "confirm step order and safety constraints";
  if (stage === "executing") return `execute concrete change for: ${objectiveSummary.slice(0, 80)}`;
  if (stage === "verifying") return "run verification and report outcome";
  return "record outcome and select next objective";
}

function shouldAskFollowUp(routeName: string, text: string, hasOpenQuestion: boolean): boolean {
  if (hasOpenQuestion) return false;
  if (routeName !== "default") return false;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  if (words.length > 5) return false;
  return /\bhelp\b|\bdo it\b|\bfix\b|\bstart\b|\bgo\b|\bok\b|\byes\b/.test(lower);
}

function objectiveId(seed: string): string {
  const normalized = seed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `obj_${normalized.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`;
}

function splitObjectiveCandidates(text: string): string[] {
  return text
    .split(/\bthen\b|->|[;\n]+/gi)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function shouldCreateObjective(candidate: string): boolean {
  if (candidate.length < 12) return false;
  return /\b(build|create|add|implement|fix|setup|configure|test|verify|deploy|update)\b/i.test(candidate);
}

function mergeObjectives(
  existing: DialogObjective[],
  newCandidates: string[],
  now: string,
): DialogObjective[] {
  const next = [...existing];
  for (const candidate of newCandidates) {
    if (!shouldCreateObjective(candidate)) continue;
    const key = candidate.toLowerCase().replace(/\s+/g, " ").trim();
    const exists = next.some((objective) => objective.text.toLowerCase() === key);
    if (exists) continue;
    next.push({
      id: objectiveId(candidate),
      text: candidate,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }
  return next.slice(-20);
}

function normalizeObjectiveStatuses(objectives: DialogObjective[]): DialogObjective[] {
  const completed = objectives.filter((objective) => objective.status === "completed");
  const remaining = objectives.filter((objective) => objective.status !== "completed");
  let activated = false;
  const normalized = remaining.map((objective) => {
    if (!activated && (objective.status === "active" || objective.status === "pending")) {
      activated = true;
      return { ...objective, status: "active" as const };
    }
    return { ...objective, status: "pending" as const };
  });
  return [...completed, ...normalized];
}

export async function loadDialogState(rootDir: string): Promise<DialogState> {
  const target = dialogStatePath(rootDir);
  if (!existsSync(target)) return { version: 1, sessions: {} };
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as DialogState;
    if (!parsed || parsed.version !== 1 || typeof parsed.sessions !== "object") {
      return { version: 1, sessions: {} };
    }
    return parsed;
  } catch {
    return { version: 1, sessions: {} };
  }
}

async function saveDialogState(rootDir: string, state: DialogState): Promise<void> {
  const target = dialogStatePath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

export async function planDialogTurn(
  rootDir: string,
  channel: SupportedChannel,
  sender: string,
  inboundText: string,
  routeName: string,
): Promise<DialogTurnPlan> {
  const state = await loadDialogState(rootDir);
  const key = sessionKey(channel, sender);
  const now = new Date().toISOString();
  const existing = state.sessions[key];
  const intent = classifyIntent(inboundText);
  const session: DialogSession = existing
    ? {
        ...existing,
        turns: Number(existing.turns || 0) + 1,
        lastSeenAt: now,
        thread: existing.thread || {
          objective: existing.objectiveSummary || "",
          stage: "scoping",
          nextStep: "clarify success criteria and target files",
        },
        objectives: Array.isArray(existing.objectives) ? existing.objectives : [],
      }
    : {
        id: key,
        channel,
        sender,
        turns: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        lastIntent: intent,
        objectiveSummary: "",
        recentMessages: [],
        objectives: [],
        thread: {
          objective: "",
          stage: "scoping",
          nextStep: "clarify success criteria and target files",
        },
      };

  session.lastIntent = intent;
  session.objectiveSummary = inferObjectiveSummary(inboundText, session.objectiveSummary);
  session.recentMessages = [...(session.recentMessages || []), inboundText.trim()].filter(Boolean).slice(-12);
  session.objectives = mergeObjectives(session.objectives || [], splitObjectiveCandidates(inboundText), now);
  if (/\bdone\b|\bcompleted\b|\bfixed\b|\bshipped\b/i.test(inboundText)) {
    const active = (session.objectives || []).find((objective) => objective.status === "active");
    if (active) {
      active.status = "completed";
      active.updatedAt = now;
      active.completedAt = now;
    }
  }
  session.objectives = normalizeObjectiveStatuses(session.objectives || []);
  const activeObjective = (session.objectives || []).find((objective) => objective.status === "active");
  session.thread.objectiveId = activeObjective?.id;
  session.thread.objective = activeObjective?.text || session.objectiveSummary;
  session.thread.stage = inferStage(inboundText, session.thread.stage || "scoping");
  session.thread.nextStep = inferNextStep(session.thread.stage, session.objectiveSummary);
  if (session.thread.stage === "completed" && !session.thread.completedAt) {
    session.thread.completedAt = now;
  }

  if (session.openQuestion && inboundText.trim().length >= 20) {
    session.openQuestion = undefined;
  }

  let followUpQuestion: string | undefined;
  if (shouldAskFollowUp(routeName, inboundText, Boolean(session.openQuestion))) {
    followUpQuestion = "Can you share the exact outcome you want next (what to change and where)?";
    session.openQuestion = followUpQuestion;
  } else if (session.openQuestion) {
    followUpQuestion = session.openQuestion;
  }

  state.sessions[key] = session;
  await saveDialogState(rootDir, state);
  return {
    session,
    followUpQuestion,
    objectiveSummary: session.objectiveSummary,
    progressLabel: session.thread.stage,
    nextStep: session.thread.nextStep,
    activeObjective: session.thread.objective,
    pendingObjectives: (session.objectives || []).filter((objective) => objective.status === "pending").length,
    completedObjectives: (session.objectives || []).filter((objective) => objective.status === "completed").length,
  };
}
