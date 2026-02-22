import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import type { SupportedChannel } from "./channels.js";
import { validateChannelCapability } from "./channels.js";

type LoopHandle = {
  timer: NodeJS.Timeout;
};

const loopHandles = new Map<string, LoopHandle>();

export interface ChannelRuntimeState {
  lastTickAt?: string;
  telegramOffset?: number;
  whatsappCursor?: number;
}

export interface ChannelRuntimeReport {
  channel: SupportedChannel;
  ok: boolean;
  processed: number;
  blocked?: string;
  lastTickAt: string;
}

export interface ChannelRuntimeOptions {
  fetchImpl?: typeof fetch;
  autoReply?: boolean;
  now?: () => Date;
}

function runtimeStatePath(rootDir: string, channel: SupportedChannel): string {
  return path.join(rootDir, "memory", "channels", channel, "runtime_state.json");
}

function inboxPath(rootDir: string, channel: SupportedChannel): string {
  return path.join(rootDir, "memory", "channels", channel, "inbox.jsonl");
}

async function readState(rootDir: string, channel: SupportedChannel): Promise<ChannelRuntimeState> {
  const target = runtimeStatePath(rootDir, channel);
  if (!existsSync(target)) return {};
  try {
    return JSON.parse(await fs.readFile(target, "utf-8")) as ChannelRuntimeState;
  } catch {
    return {};
  }
}

async function writeState(rootDir: string, channel: SupportedChannel, state: ChannelRuntimeState): Promise<void> {
  const target = runtimeStatePath(rootDir, channel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(state, null, 2), "utf-8");
}

async function appendInbox(rootDir: string, channel: SupportedChannel, entry: Record<string, any>): Promise<void> {
  const target = inboxPath(rootDir, channel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(entry)}\n`, "utf-8");
}

function loopKey(rootDir: string, channel: SupportedChannel): string {
  return `${rootDir}::${channel}`;
}

async function sendTelegramMessage(
  token: string,
  chatId: string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram send failed (${response.status}): ${body || response.statusText}`);
  }
}

async function runTelegramTick(
  rootDir: string,
  state: ChannelRuntimeState,
  options: ChannelRuntimeOptions,
): Promise<number> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return 0;

  const fetchImpl = options.fetchImpl || fetch;
  const offset = Number(state.telegramOffset || 0);
  const response = await fetchImpl(
    `https://api.telegram.org/bot${botToken}/getUpdates?offset=${offset}&timeout=0&limit=50`,
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Telegram getUpdates failed (${response.status}): ${body || response.statusText}`);
  }
  const payload = await response.json() as { ok?: boolean; result?: any[] };
  const updates = Array.isArray(payload.result) ? payload.result : [];
  let processed = 0;
  let maxUpdateId = offset;

  for (const update of updates) {
    const updateId = Number(update?.update_id || 0);
    if (updateId > maxUpdateId) maxUpdateId = updateId + 1;
    const message = update?.message;
    const text = String(message?.text || "").trim();
    const chatId = String(message?.chat?.id || "");
    if (!chatId || !text) continue;
    processed += 1;
    await appendInbox(rootDir, "telegram", {
      channel: "telegram",
      externalId: `telegram:${updateId}`,
      chatId,
      fromId: String(message?.from?.id || ""),
      text,
      receivedAt: new Date().toISOString(),
    });
    if (options.autoReply) {
      await sendTelegramMessage(botToken, chatId, `Acknowledged: ${text}`, fetchImpl);
    }
  }

  state.telegramOffset = maxUpdateId;
  return processed;
}

function extractWhatsAppEvents(line: string): Array<{ id: string; from: string; text: string }> {
  try {
    const parsed = JSON.parse(line);
    const events: Array<{ id: string; from: string; text: string }> = [];
    const entries = Array.isArray(parsed?.entry) ? parsed.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
        for (const msg of messages) {
          const text = String(msg?.text?.body || "").trim();
          const from = String(msg?.from || "").trim();
          const id = String(msg?.id || "").trim();
          if (!text || !from || !id) continue;
          events.push({ id, from, text });
        }
      }
    }
    return events;
  } catch {
    return [];
  }
}

async function sendWhatsAppMessage(
  token: string,
  phoneNumberId: string,
  to: string,
  text: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${response.status}): ${body || response.statusText}`);
  }
}

async function runWhatsAppTick(
  rootDir: string,
  state: ChannelRuntimeState,
  options: ChannelRuntimeOptions,
): Promise<number> {
  const webhookPath = path.join(rootDir, "memory", "channels", "whatsapp", "inbound_webhooks.jsonl");
  if (!existsSync(webhookPath)) {
    state.whatsappCursor = state.whatsappCursor || 0;
    return 0;
  }
  const raw = await fs.readFile(webhookPath, "utf-8");
  const lines = raw.split("\n").filter(Boolean);
  const cursor = Number(state.whatsappCursor || 0);
  let processed = 0;
  const fetchImpl = options.fetchImpl || fetch;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  for (let i = cursor; i < lines.length; i += 1) {
    const events = extractWhatsAppEvents(lines[i]);
    for (const event of events) {
      processed += 1;
      await appendInbox(rootDir, "whatsapp", {
        channel: "whatsapp",
        externalId: `whatsapp:${event.id}`,
        from: event.from,
        text: event.text,
        receivedAt: new Date().toISOString(),
      });
      if (options.autoReply && token && phoneNumberId) {
        await sendWhatsAppMessage(token, phoneNumberId, event.from, `Acknowledged: ${event.text}`, fetchImpl);
      }
    }
  }
  state.whatsappCursor = lines.length;
  return processed;
}

export async function runChannelRuntimeTick(
  rootDir: string,
  channel: SupportedChannel,
  options: ChannelRuntimeOptions = {},
): Promise<ChannelRuntimeReport> {
  const now = options.now ? options.now() : new Date();
  const validation = await validateChannelCapability(rootDir, channel);
  if (!validation.ok) {
    return {
      channel,
      ok: false,
      processed: 0,
      blocked: validation.message,
      lastTickAt: now.toISOString(),
    };
  }

  const state = await readState(rootDir, channel);
  let processed = 0;
  if (channel === "telegram") {
    processed = await runTelegramTick(rootDir, state, options);
  } else {
    processed = await runWhatsAppTick(rootDir, state, options);
  }

  state.lastTickAt = now.toISOString();
  await writeState(rootDir, channel, state);
  return {
    channel,
    ok: true,
    processed,
    lastTickAt: now.toISOString(),
  };
}

export async function startChannelRuntimeLoop(
  rootDir: string,
  channel: SupportedChannel,
  intervalMs = 15000,
  options: ChannelRuntimeOptions = {},
): Promise<void> {
  if (!Number.isFinite(intervalMs) || intervalMs < 1000) {
    throw new Error("Invalid channel runtime interval. Must be >= 1000ms.");
  }
  const key = loopKey(rootDir, channel);
  if (loopHandles.has(key)) return;

  await runChannelRuntimeTick(rootDir, channel, options).catch(() => {});
  const timer = setInterval(() => {
    runChannelRuntimeTick(rootDir, channel, options).catch(() => {});
  }, intervalMs);
  loopHandles.set(key, { timer });
}

export function stopChannelRuntimeLoop(rootDir: string, channel: SupportedChannel): void {
  const key = loopKey(rootDir, channel);
  const handle = loopHandles.get(key);
  if (!handle) return;
  clearInterval(handle.timer);
  loopHandles.delete(key);
}
