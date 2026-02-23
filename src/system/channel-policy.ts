import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { z } from "zod";
import type { SupportedChannel } from "./channels.js";

const CHANNEL_POLICY_FILE = "brain/channel_policy.json";

const MatchSchema = z.object({
  containsAny: z.array(z.string().min(1)).default([]),
  startsWithAny: z.array(z.string().min(1)).default([]),
  senderAllowlist: z.array(z.string().min(1)).default([]),
});

const RouteSchema = z.object({
  name: z.string().min(1),
  match: MatchSchema,
  responseTemplate: z.string().min(1),
  suppressReply: z.boolean().default(false),
});

const QuietHoursSchema = z.object({
  enabled: z.boolean().default(false),
  startHourUtc: z.number().int().min(0).max(23).default(23),
  endHourUtc: z.number().int().min(0).max(23).default(7),
});

const ChannelPolicySchema = z.object({
  enabled: z.boolean().default(true),
  blockedSenders: z.array(z.string().min(1)).default([]),
  defaultResponseTemplate: z.string().min(1).default("Acknowledged: {{text}}"),
  quietHours: QuietHoursSchema.default({ enabled: false, startHourUtc: 23, endHourUtc: 7 }),
  routes: z.array(RouteSchema).default([]),
});

const PolicySchema = z.object({
  version: z.number().int().min(1).default(1),
  telegram: ChannelPolicySchema,
  whatsapp: ChannelPolicySchema,
});

export type ChannelPolicyConfig = z.infer<typeof PolicySchema>;
export type ChannelRouteDecision = {
  channel: SupportedChannel;
  sender: string;
  text: string;
  routeName: string;
  blocked: boolean;
  suppressed: boolean;
  shouldReply: boolean;
  reason: string;
  responseText?: string;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function inQuietHours(now: Date, quietHours: z.infer<typeof QuietHoursSchema>): boolean {
  if (!quietHours.enabled) return false;
  const hour = now.getUTCHours();
  const start = quietHours.startHourUtc;
  const end = quietHours.endHourUtc;
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function routeMatches(route: z.infer<typeof RouteSchema>, text: string, sender: string): boolean {
  const lowerText = normalize(text);
  const lowerSender = normalize(sender);
  const containsAny = route.match.containsAny || [];
  const startsWithAny = route.match.startsWithAny || [];
  const senderAllowlist = route.match.senderAllowlist || [];
  if (senderAllowlist.length > 0 && !senderAllowlist.some((item) => normalize(item) === lowerSender)) {
    return false;
  }
  if (containsAny.length > 0) {
    const found = containsAny.some((item) => lowerText.includes(normalize(item)));
    if (!found) return false;
  }
  if (startsWithAny.length > 0) {
    const found = startsWithAny.some((item) => lowerText.startsWith(normalize(item)));
    if (!found) return false;
  }
  return containsAny.length > 0 || startsWithAny.length > 0 || senderAllowlist.length > 0;
}

function renderTemplate(
  template: string,
  context: { text: string; sender: string; channel: SupportedChannel; route: string },
): string {
  return template
    .replaceAll("{{text}}", context.text)
    .replaceAll("{{sender}}", context.sender)
    .replaceAll("{{channel}}", context.channel)
    .replaceAll("{{route}}", context.route)
    .trim();
}

export function defaultChannelPolicy(): ChannelPolicyConfig {
  return PolicySchema.parse({
    version: 1,
    telegram: {
      enabled: true,
      blockedSenders: [],
      defaultResponseTemplate: "Acknowledged: {{text}}",
      quietHours: { enabled: false, startHourUtc: 23, endHourUtc: 7 },
      routes: [
        {
          name: "help",
          match: { containsAny: ["help", "support"], startsWithAny: [], senderAllowlist: [] },
          responseTemplate: "I can help. Tell me your goal and I will propose next actions.",
          suppressReply: false,
        },
      ],
    },
    whatsapp: {
      enabled: true,
      blockedSenders: [],
      defaultResponseTemplate: "Received on {{channel}}: {{text}}",
      quietHours: { enabled: false, startHourUtc: 23, endHourUtc: 7 },
      routes: [
        {
          name: "maintenance",
          match: { containsAny: ["sleep", "maintain"], startsWithAny: [], senderAllowlist: [] },
          responseTemplate: "Maintenance noted. I will run upkeep on the next cycle.",
          suppressReply: false,
        },
      ],
    },
  });
}

export function channelPolicyPath(rootDir: string): string {
  return path.join(rootDir, CHANNEL_POLICY_FILE);
}

export async function readChannelPolicy(rootDir: string): Promise<ChannelPolicyConfig> {
  const target = channelPolicyPath(rootDir);
  if (!existsSync(target)) {
    const defaults = defaultChannelPolicy();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(defaults, null, 2), "utf-8");
    return defaults;
  }
  const raw = JSON.parse(await fs.readFile(target, "utf-8"));
  return PolicySchema.parse(raw);
}

export function evaluateChannelPolicy(
  channel: SupportedChannel,
  text: string,
  sender: string,
  policy: ChannelPolicyConfig,
  now: Date = new Date(),
): ChannelRouteDecision {
  const channelPolicy = policy[channel];
  const normalizedSender = normalize(sender);
  if (!channelPolicy.enabled) {
    return {
      channel,
      sender,
      text,
      routeName: "disabled",
      blocked: false,
      suppressed: true,
      shouldReply: false,
      reason: "channel disabled by policy",
    };
  }
  if (channelPolicy.blockedSenders.some((item) => normalize(item) === normalizedSender)) {
    return {
      channel,
      sender,
      text,
      routeName: "blocked",
      blocked: true,
      suppressed: true,
      shouldReply: false,
      reason: "sender blocked by policy",
    };
  }
  if (inQuietHours(now, channelPolicy.quietHours)) {
    return {
      channel,
      sender,
      text,
      routeName: "quiet_hours",
      blocked: false,
      suppressed: true,
      shouldReply: false,
      reason: "quiet hours",
    };
  }

  const route = channelPolicy.routes.find((item) => routeMatches(item, text, sender));
  if (route) {
    if (route.suppressReply) {
      return {
        channel,
        sender,
        text,
        routeName: route.name,
        blocked: false,
        suppressed: true,
        shouldReply: false,
        reason: "route suppressed reply",
      };
    }
    const responseText = renderTemplate(route.responseTemplate, {
      text,
      sender,
      channel,
      route: route.name,
    });
    return {
      channel,
      sender,
      text,
      routeName: route.name,
      blocked: false,
      suppressed: false,
      shouldReply: responseText.length > 0,
      reason: "route matched",
      responseText,
    };
  }

  const defaultResponseText = renderTemplate(channelPolicy.defaultResponseTemplate, {
    text,
    sender,
    channel,
    route: "default",
  });
  return {
    channel,
    sender,
    text,
    routeName: "default",
    blocked: false,
    suppressed: false,
    shouldReply: defaultResponseText.length > 0,
    reason: "default response",
    responseText: defaultResponseText,
  };
}
