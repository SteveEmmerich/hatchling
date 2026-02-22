import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { enableCapability, loadCapabilities } from "./capabilities.js";

export type SupportedChannel = "telegram" | "whatsapp";

export interface ChannelValidationResult {
  channel: SupportedChannel;
  ok: boolean;
  requiredEnv: string[];
  missingEnv: string[];
  message: string;
}

export interface ChannelSendOptions {
  mode?: "simulate" | "live" | "auto";
  fetchImpl?: typeof fetch;
}

function ensureSupported(name: string): SupportedChannel {
  const normalized = name.trim().toLowerCase();
  if (normalized !== "telegram" && normalized !== "whatsapp") {
    throw new Error(`Unsupported channel '${name}'. Use telegram or whatsapp.`);
  }
  return normalized;
}

function channelCapabilityName(channel: SupportedChannel): string {
  return `channel.${channel}`;
}

function channelSkillName(channel: SupportedChannel): string {
  return `${channel}-gateway`;
}

const SHARED_CHANNEL_SKILL = "channel-mcp-bridge";

function sharedChannelSkillDoc(): string {
  return [
    "# channel-mcp-bridge",
    "",
    "Reusable bridge skill for conversational channel onboarding via MCP servers.",
    "",
    "## Purpose",
    "- Keep channel setup reusable across Telegram and WhatsApp.",
    "- Provide known MCP server options with clear defaults.",
    "- Let users opt into specific providers instead of requiring all channels up front.",
    "",
    "## Recommended MCP Servers",
    "- Telegram: https://github.com/chaindead/telegram-mcp",
    "- WhatsApp: https://github.com/lharries/whatsapp-mcp",
    "",
    "## Workflow",
    "1. Bootstrap channel capability (`hatchling channel bootstrap <telegram|whatsapp>`).",
    "2. Validate env vars (`hatchling channel validate <channel>`).",
    "3. Test delivery (`hatchling channel test-message <channel> ...`).",
    "4. Add/enable MCP server config if user wants ongoing inbound/outbound automation.",
    "",
  ].join("\n");
}

function channelSkillDoc(channel: SupportedChannel): string {
  if (channel === "telegram") {
    return [
      "# telegram-gateway",
      "",
      "Enable Telegram communication for Hatchling.",
      "",
      "## Requirements",
      "- TELEGRAM_BOT_TOKEN",
      "- TELEGRAM_CHAT_ID",
      "",
      "## Usage",
      "- Validate with `hatchling channel validate telegram`.",
      "- Send test with `hatchling channel test-message telegram --message \"hello\"`.",
      "",
    ].join("\n");
  }
  return [
    "# whatsapp-gateway",
    "",
    "Enable WhatsApp communication for Hatchling.",
    "",
    "## Requirements",
    "- WHATSAPP_ACCESS_TOKEN",
    "- WHATSAPP_PHONE_NUMBER_ID",
    "",
    "## Usage",
    "- Validate with `hatchling channel validate whatsapp`.",
    "- Send test with `hatchling channel test-message whatsapp --message \"hello\"`.",
    "",
  ].join("\n");
}

function defaultChannelMetadata(channel: SupportedChannel): Record<string, string> {
  if (channel === "telegram") {
    return {
      botTokenEnvVar: "TELEGRAM_BOT_TOKEN",
      chatIdEnvVar: "TELEGRAM_CHAT_ID",
    };
  }
  return {
    provider: "meta",
    accessTokenEnvVar: "WHATSAPP_ACCESS_TOKEN",
    phoneNumberIdEnvVar: "WHATSAPP_PHONE_NUMBER_ID",
  };
}

function channelRequiredEnv(channel: SupportedChannel, metadata: Record<string, any>): string[] {
  if (channel === "telegram") {
    return [
      String(metadata.botTokenEnvVar || "TELEGRAM_BOT_TOKEN"),
      String(metadata.chatIdEnvVar || "TELEGRAM_CHAT_ID"),
    ];
  }
  return [
    String(metadata.accessTokenEnvVar || "WHATSAPP_ACCESS_TOKEN"),
    String(metadata.phoneNumberIdEnvVar || "WHATSAPP_PHONE_NUMBER_ID"),
  ];
}

export async function ensureChannelGatewaySkill(
  rootDir: string,
  channelName: string,
): Promise<{ channel: SupportedChannel; skillPath: string; created: boolean }> {
  const channel = ensureSupported(channelName);
  const skillDir = path.join(rootDir, "limbs", channelSkillName(channel));
  let created = false;
  if (!existsSync(skillDir)) {
    created = true;
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), channelSkillDoc(channel), "utf-8");
    await fs.writeFile(
      path.join(skillDir, "manifest.json"),
      JSON.stringify(
        {
          name: channelSkillName(channel),
          channel,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf-8",
    );
  }

  return { channel, skillPath: skillDir, created };
}

export async function ensureSharedChannelBridgeSkill(
  rootDir: string,
): Promise<{ skillPath: string; created: boolean }> {
  const skillDir = path.join(rootDir, "limbs", SHARED_CHANNEL_SKILL);
  let created = false;
  if (!existsSync(skillDir)) {
    created = true;
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), sharedChannelSkillDoc(), "utf-8");
    await fs.writeFile(
      path.join(skillDir, "manifest.json"),
      JSON.stringify(
        {
          name: SHARED_CHANNEL_SKILL,
          createdAt: new Date().toISOString(),
          purpose: "channel_gateway_reuse",
        },
        null,
        2,
      ),
      "utf-8",
    );
  }
  return { skillPath: skillDir, created };
}

export async function bootstrapChannelCapability(rootDir: string, channelName: string): Promise<{
  channel: SupportedChannel;
  skillPath: string;
  createdGateway: boolean;
  sharedSkillPath: string;
  createdSharedSkill: boolean;
}> {
  const { channel, skillPath, created } = await ensureChannelGatewaySkill(rootDir, channelName);
  const shared = await ensureSharedChannelBridgeSkill(rootDir);

  await enableCapability(rootDir, channelCapabilityName(channel), {
    ...defaultChannelMetadata(channel),
  });

  return {
    channel,
    skillPath,
    createdGateway: created,
    sharedSkillPath: shared.skillPath,
    createdSharedSkill: shared.created,
  };
}

export async function validateChannelCapability(rootDir: string, channelName: string): Promise<ChannelValidationResult> {
  const channel = ensureSupported(channelName);
  const registry = await loadCapabilities(rootDir);
  const cap = registry.capabilities[channelCapabilityName(channel)] || {
    enabled: false,
    updatedAt: new Date().toISOString(),
    metadata: {},
  };
  const requiredEnv = channelRequiredEnv(channel, cap.metadata || {});
  const missingEnv = requiredEnv.filter((name) => !process.env[name]);

  if (!cap.enabled) {
    return {
      channel,
      ok: false,
      requiredEnv,
      missingEnv,
      message: `Capability ${channelCapabilityName(channel)} is disabled. Bootstrap first.`,
    };
  }

  if (missingEnv.length > 0) {
    return {
      channel,
      ok: false,
      requiredEnv,
      missingEnv,
      message: `Missing required environment variables: ${missingEnv.join(", ")}`,
    };
  }

  return {
    channel,
    ok: true,
    requiredEnv,
    missingEnv: [],
    message: `${channel} channel is ready.`,
  };
}

export async function sendChannelTestMessage(
  rootDir: string,
  channelName: string,
  message: string,
  options: ChannelSendOptions = {},
): Promise<{ ok: boolean; outboxPath: string; entry: Record<string, any>; validation: ChannelValidationResult }> {
  const channel = ensureSupported(channelName);
  const validation = await validateChannelCapability(rootDir, channel);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const mode = options.mode || "simulate";
  const useLive = mode === "live" || (mode === "auto" && validation.ok);

  let delivery: Record<string, any> = { simulated: true, mode: "simulate" };
  if (useLive) {
    delivery = await sendLiveChannelMessage(channel, message, validation, options.fetchImpl || fetch);
  }

  const outboxPath = path.join(rootDir, "memory", "channels", channel, "outbox.jsonl");
  await fs.mkdir(path.dirname(outboxPath), { recursive: true });

  const entry = {
    channel,
    message,
    timestamp: new Date().toISOString(),
    ...delivery,
  };
  await fs.appendFile(outboxPath, JSON.stringify(entry) + "\n", "utf-8");

  return {
    ok: true,
    outboxPath,
    entry,
    validation,
  };
}

async function sendLiveChannelMessage(
  channel: SupportedChannel,
  message: string,
  validation: ChannelValidationResult,
  fetchImpl: typeof fetch,
): Promise<Record<string, any>> {
  if (channel === "telegram") {
    const [tokenEnv, chatEnv] = validation.requiredEnv;
    const token = process.env[tokenEnv];
    const chatId = process.env[chatEnv];
    if (!token || !chatId) {
      throw new Error(`Missing Telegram credentials in ${tokenEnv}/${chatEnv}.`);
    }
    const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Telegram delivery failed (${response.status}): ${body || response.statusText}`);
    }
    const payload = await response.json().catch(() => ({}));
    return {
      simulated: false,
      mode: "live",
      provider: "telegram",
      delivery: payload,
    };
  }

  const [tokenEnv, phoneIdEnv] = validation.requiredEnv;
  const accessToken = process.env[tokenEnv];
  const phoneNumberId = process.env[phoneIdEnv];
  if (!accessToken || !phoneNumberId) {
    throw new Error(`Missing WhatsApp credentials in ${tokenEnv}/${phoneIdEnv}.`);
  }

  const response = await fetchImpl(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: "0000000000",
      type: "text",
      text: { body: message },
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`WhatsApp delivery failed (${response.status}): ${body || response.statusText}`);
  }
  const payload = await response.json().catch(() => ({}));
  return {
    simulated: false,
    mode: "live",
    provider: "whatsapp",
    delivery: payload,
  };
}
