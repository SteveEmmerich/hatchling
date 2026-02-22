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
): Promise<{ channel: SupportedChannel; skillPath: string }> {
  const channel = ensureSupported(channelName);
  const skillDir = path.join(rootDir, "limbs", channelSkillName(channel));
  if (!existsSync(skillDir)) {
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

  return { channel, skillPath: skillDir };
}

export async function bootstrapChannelCapability(rootDir: string, channelName: string): Promise<{ channel: SupportedChannel; skillPath: string }> {
  const { channel, skillPath } = await ensureChannelGatewaySkill(rootDir, channelName);

  await enableCapability(rootDir, channelCapabilityName(channel), {
    ...defaultChannelMetadata(channel),
  });

  return { channel, skillPath };
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
): Promise<{ ok: boolean; outboxPath: string; entry: Record<string, any>; validation: ChannelValidationResult }> {
  const channel = ensureSupported(channelName);
  const validation = await validateChannelCapability(rootDir, channel);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const outboxPath = path.join(rootDir, "memory", "channels", channel, "outbox.jsonl");
  await fs.mkdir(path.dirname(outboxPath), { recursive: true });

  const entry = {
    channel,
    message,
    timestamp: new Date().toISOString(),
    simulated: true,
  };
  await fs.appendFile(outboxPath, JSON.stringify(entry) + "\n", "utf-8");

  return {
    ok: true,
    outboxPath,
    entry,
    validation,
  };
}
