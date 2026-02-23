import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import http from "node:http";
import crypto from "node:crypto";
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

export interface WhatsAppWebhookIngressOptions {
  host?: string;
  port?: number;
  path?: string;
  verifyTokenEnvVar?: string;
  appSecretEnvVar?: string;
  maxBodyBytes?: number;
}

export interface WhatsAppWebhookIngressHandle {
  host: string;
  port: number;
  path: string;
  close: () => Promise<void>;
}

export interface WhatsAppWebhookChallengeResult {
  ok: boolean;
  statusCode: number;
  challenge?: string;
  error?: string;
}

function runtimeStatePath(rootDir: string, channel: SupportedChannel): string {
  return path.join(rootDir, "memory", "channels", channel, "runtime_state.json");
}

function inboxPath(rootDir: string, channel: SupportedChannel): string {
  return path.join(rootDir, "memory", "channels", channel, "inbox.jsonl");
}

function whatsappInboundWebhookPath(rootDir: string): string {
  return path.join(rootDir, "memory", "channels", "whatsapp", "inbound_webhooks.jsonl");
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

async function appendWhatsAppInboundWebhook(rootDir: string, body: string): Promise<void> {
  const target = whatsappInboundWebhookPath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${body}\n`, "utf-8");
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
  const webhookPath = whatsappInboundWebhookPath(rootDir);
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

function normalizeWebhookPath(input: string | undefined): string {
  const value = (input || "/webhooks/whatsapp").trim();
  if (!value) return "/webhooks/whatsapp";
  return value.startsWith("/") ? value : `/${value}`;
}

function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
  const expectedDigest = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf-8")
    .digest("hex");
  const expected = `sha256=${expectedDigest}`;
  if (!signatureHeader) return false;
  const actual = signatureHeader.trim();
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function validateWhatsAppWebhookChallenge(
  query: URLSearchParams,
  expectedVerifyToken: string | undefined,
): WhatsAppWebhookChallengeResult {
  const mode = query.get("hub.mode");
  const verifyToken = query.get("hub.verify_token");
  const challenge = query.get("hub.challenge") || "";
  if (!expectedVerifyToken) {
    return {
      ok: false,
      statusCode: 500,
      error: "Missing verify token configuration",
    };
  }
  if (mode === "subscribe" && verifyToken === expectedVerifyToken) {
    return {
      ok: true,
      statusCode: 200,
      challenge,
    };
  }
  return {
    ok: false,
    statusCode: 403,
    error: "Forbidden",
  };
}

export async function ingestWhatsAppWebhookPayload(
  rootDir: string,
  rawBody: string,
  options: { appSecret?: string; signatureHeader?: string } = {},
): Promise<void> {
  const normalized = rawBody.trim();
  if (!normalized) throw new Error("Empty payload");
  if (options.appSecret) {
    const valid = verifyWhatsAppSignature(normalized, options.signatureHeader, options.appSecret);
    if (!valid) throw new Error("Invalid signature");
  }
  JSON.parse(normalized);
  await appendWhatsAppInboundWebhook(rootDir, normalized);
}

export async function startWhatsAppWebhookIngress(
  rootDir: string,
  options: WhatsAppWebhookIngressOptions = {},
): Promise<WhatsAppWebhookIngressHandle> {
  const host = String(options.host || "0.0.0.0");
  const port = Number.isFinite(options.port) ? Number(options.port) : 3001;
  if (!Number.isFinite(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid webhook port '${String(options.port)}'.`);
  }
  const routePath = normalizeWebhookPath(options.path);
  const verifyTokenEnvVar = String(options.verifyTokenEnvVar || "WHATSAPP_WEBHOOK_VERIFY_TOKEN");
  const appSecretEnvVar = String(options.appSecretEnvVar || "WHATSAPP_APP_SECRET");
  const maxBodyBytes = Number.isFinite(options.maxBodyBytes) ? Number(options.maxBodyBytes) : 1024 * 1024;
  if (!Number.isFinite(maxBodyBytes) || maxBodyBytes < 1024) {
    throw new Error(`Invalid maxBodyBytes '${String(options.maxBodyBytes)}'.`);
  }

  const server = http.createServer(async (req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    const parsedUrl = new URL(req.url || "/", "http://localhost");
    if (parsedUrl.pathname !== routePath) {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "Not found" }));
      return;
    }

    if (method === "GET") {
      const expectedVerifyToken = process.env[verifyTokenEnvVar];
      const challengeResult = validateWhatsAppWebhookChallenge(parsedUrl.searchParams, expectedVerifyToken);
      if (challengeResult.ok) {
        res.statusCode = challengeResult.statusCode;
        res.setHeader("content-type", "text/plain");
        res.end(challengeResult.challenge || "");
        return;
      }
      res.statusCode = challengeResult.statusCode;
      res.end(challengeResult.error || `Missing ${verifyTokenEnvVar}`);
      return;
    }

    if (method !== "POST") {
      res.statusCode = 405;
      res.setHeader("allow", "GET, POST");
      res.end("Method Not Allowed");
      return;
    }

    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bufferChunk.byteLength;
        if (size > maxBodyBytes) {
          res.statusCode = 413;
          res.end("Payload too large");
          return;
        }
        chunks.push(bufferChunk);
      }
      const rawBody = Buffer.concat(chunks).toString("utf-8").trim();
      const appSecret = process.env[appSecretEnvVar];
      const signatureHeader = Array.isArray(req.headers["x-hub-signature-256"])
        ? req.headers["x-hub-signature-256"][0]
        : req.headers["x-hub-signature-256"];
      await ingestWhatsAppWebhookPayload(rootDir, rawBody, { appSecret, signatureHeader });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    } catch (error: any) {
      const message = String(error?.message || error);
      res.statusCode = message.includes("Invalid signature") ? 401 : 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(port, host, () => {
      server.removeListener("error", rejectPromise);
      resolvePromise();
    });
  });

  const address = server.address();
  let boundPort = port;
  if (address && typeof address === "object") {
    boundPort = address.port;
  }

  return {
    host,
    port: boundPort,
    path: routePath,
    close: async () => {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) rejectPromise(error);
          else resolvePromise();
        });
      });
    },
  };
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
