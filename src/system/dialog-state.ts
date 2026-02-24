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
}

export interface DialogState {
  version: 1;
  sessions: Record<string, DialogSession>;
}

export interface DialogTurnPlan {
  session: DialogSession;
  followUpQuestion?: string;
  objectiveSummary: string;
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

function shouldAskFollowUp(routeName: string, text: string, hasOpenQuestion: boolean): boolean {
  if (hasOpenQuestion) return false;
  if (routeName !== "default") return false;
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lower = text.toLowerCase();
  if (words.length > 5) return false;
  return /\bhelp\b|\bdo it\b|\bfix\b|\bstart\b|\bgo\b|\bok\b|\byes\b/.test(lower);
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
      };

  session.lastIntent = intent;
  session.objectiveSummary = inferObjectiveSummary(inboundText, session.objectiveSummary);
  session.recentMessages = [...(session.recentMessages || []), inboundText.trim()].filter(Boolean).slice(-12);

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
  };
}
