import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { z } from "zod";
import { loadCapabilities, type CapabilityRegistry, checkProviderReadiness } from "./capabilities.js";
import { listMCPServers, type MCPServerConfig } from "./mcp.js";
import { ensureChannelGatewaySkill } from "./channels.js";

const CONTROL_PLANE_FILE = "brain/control-plane.json";
const SKILL_POLICY_FILE = "brain/skill_policy.json";
const EVOLVE_POLICY_FILE = "brain/evolve_policy.json";
const CONFIG_FILE = "brain/config.json";
const CAPABILITIES_FILE = "brain/capabilities.json";
const MCP_FILE = "brain/mcp_servers.json";

const defaultSkillPolicy = {
  allowedHosts: ["github.com", "gitlab.com", "bitbucket.org"],
  allowLocalPaths: true,
  requireApprovalForUntrusted: true,
};

const defaultEvolvePolicy = {
  enforceApprovals: true,
};

const ControlPlaneSchema = z.object({
  version: z.number().int().min(1),
  provider: z.object({
    name: z.string().min(1),
    model: z.string().min(1),
  }),
  capabilities: z.record(
    z.string(),
    z.object({
      enabled: z.boolean(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  policies: z.object({
    skillInstall: z.object({
      allowedHosts: z.array(z.string()),
      allowLocalPaths: z.boolean(),
      requireApprovalForUntrusted: z.boolean(),
    }),
    evolve: z.object({
      enforceApprovals: z.boolean(),
    }),
  }),
  mcpServers: z.array(
    z.object({
      name: z.string(),
      command: z.string(),
      args: z.array(z.string()),
      enabled: z.boolean(),
      createdAt: z.string(),
    }),
  ),
  channels: z.object({
    telegram: z.object({
      enabled: z.boolean(),
      botTokenEnvVar: z.string(),
      chatIdEnvVar: z.string(),
    }),
    whatsapp: z.object({
      enabled: z.boolean(),
      provider: z.string(),
      accessTokenEnvVar: z.string(),
      phoneNumberIdEnvVar: z.string(),
    }),
  }),
});

export type ControlPlane = z.infer<typeof ControlPlaneSchema>;

export function controlPlanePath(rootDir: string): string {
  return path.join(rootDir, CONTROL_PLANE_FILE);
}

async function readJsonOrDefault<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(await fs.readFile(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function fromCapabilities(registry: CapabilityRegistry): Record<string, { enabled: boolean; metadata?: Record<string, unknown> }> {
  const entries = Object.entries(registry.capabilities).map(([name, state]) => [
    name,
    {
      enabled: Boolean(state.enabled),
      metadata: state.metadata || {},
    },
  ] as const);
  return Object.fromEntries(entries);
}

function resolveChannels(capabilities: Record<string, { enabled: boolean; metadata?: Record<string, unknown> }>) {
  const telegram = capabilities["channel.telegram"] || { enabled: false, metadata: {} };
  const whatsapp = capabilities["channel.whatsapp"] || { enabled: false, metadata: {} };
  return {
    telegram: {
      enabled: telegram.enabled,
      botTokenEnvVar: String(telegram.metadata?.botTokenEnvVar || "TELEGRAM_BOT_TOKEN"),
      chatIdEnvVar: String(telegram.metadata?.chatIdEnvVar || "TELEGRAM_CHAT_ID"),
    },
    whatsapp: {
      enabled: whatsapp.enabled,
      provider: String(whatsapp.metadata?.provider || "meta"),
      accessTokenEnvVar: String(whatsapp.metadata?.accessTokenEnvVar || "WHATSAPP_ACCESS_TOKEN"),
      phoneNumberIdEnvVar: String(whatsapp.metadata?.phoneNumberIdEnvVar || "WHATSAPP_PHONE_NUMBER_ID"),
    },
  };
}

export async function buildControlPlaneFromState(rootDir: string): Promise<ControlPlane> {
  const configPath = path.join(rootDir, CONFIG_FILE);
  const skillPolicyPath = path.join(rootDir, SKILL_POLICY_FILE);
  const evolvePolicyPath = path.join(rootDir, EVOLVE_POLICY_FILE);

  const config = await readJsonOrDefault<Record<string, any>>(configPath, {
    provider: "hindbrain",
    model: "hindbrain-1b",
  });
  const capabilities = fromCapabilities(await loadCapabilities(rootDir));
  const skillPolicy = await readJsonOrDefault(skillPolicyPath, defaultSkillPolicy);
  const evolvePolicy = await readJsonOrDefault(evolvePolicyPath, defaultEvolvePolicy);
  const mcpServers = await listMCPServers(rootDir);

  return {
    version: 1,
    provider: {
      name: String(config.provider || "hindbrain"),
      model: String(config.model || "hindbrain-1b"),
    },
    capabilities,
    policies: {
      skillInstall: {
        allowedHosts: Array.isArray(skillPolicy.allowedHosts)
          ? skillPolicy.allowedHosts.map((host: unknown) => String(host))
          : defaultSkillPolicy.allowedHosts,
        allowLocalPaths: skillPolicy.allowLocalPaths !== false,
        requireApprovalForUntrusted: skillPolicy.requireApprovalForUntrusted !== false,
      },
      evolve: {
        enforceApprovals: Boolean(evolvePolicy.enforceApprovals),
      },
    },
    mcpServers,
    channels: resolveChannels(capabilities),
  };
}

export async function writeControlPlane(rootDir: string, controlPlane: ControlPlane): Promise<string> {
  const target = controlPlanePath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(controlPlane, null, 2), "utf-8");
  return target;
}

export async function initControlPlane(rootDir: string): Promise<string> {
  const generated = await buildControlPlaneFromState(rootDir);
  return writeControlPlane(rootDir, generated);
}

export async function readControlPlane(rootDir: string): Promise<ControlPlane> {
  const target = controlPlanePath(rootDir);
  if (!existsSync(target)) {
    return buildControlPlaneFromState(rootDir);
  }
  const raw = JSON.parse(await fs.readFile(target, "utf-8"));
  return validateControlPlane(raw);
}

export function validateControlPlane(raw: unknown): ControlPlane {
  return ControlPlaneSchema.parse(raw);
}

export async function applyControlPlane(rootDir: string, controlPlane: ControlPlane): Promise<void> {
  const validated = validateControlPlane(controlPlane);

  const readiness = checkProviderReadiness(validated.provider.name);
  if (!readiness.ok) {
    throw new Error(`Cannot apply control-plane: ${readiness.message}`);
  }

  const configPath = path.join(rootDir, CONFIG_FILE);
  const existingConfig = await readJsonOrDefault<Record<string, any>>(configPath, {});
  existingConfig.provider = validated.provider.name;
  existingConfig.model = validated.provider.model;
  existingConfig.lastActive = new Date().toISOString();
  await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2), "utf-8");

  const now = new Date().toISOString();
  const capabilitiesPayload = {
    capabilities: Object.fromEntries(
      Object.entries(validated.capabilities).map(([name, state]) => [
        name,
        {
          enabled: Boolean(state.enabled),
          updatedAt: now,
          metadata: state.metadata || {},
        },
      ]),
    ),
  };

  capabilitiesPayload.capabilities["channel.telegram"] = {
    enabled: validated.channels.telegram.enabled,
    updatedAt: now,
    metadata: {
      botTokenEnvVar: validated.channels.telegram.botTokenEnvVar,
      chatIdEnvVar: validated.channels.telegram.chatIdEnvVar,
    },
  };
  capabilitiesPayload.capabilities["channel.whatsapp"] = {
    enabled: validated.channels.whatsapp.enabled,
    updatedAt: now,
    metadata: {
      provider: validated.channels.whatsapp.provider,
      accessTokenEnvVar: validated.channels.whatsapp.accessTokenEnvVar,
      phoneNumberIdEnvVar: validated.channels.whatsapp.phoneNumberIdEnvVar,
    },
  };

  await fs.writeFile(path.join(rootDir, CAPABILITIES_FILE), JSON.stringify(capabilitiesPayload, null, 2), "utf-8");

  await fs.writeFile(
    path.join(rootDir, SKILL_POLICY_FILE),
    JSON.stringify(validated.policies.skillInstall, null, 2),
    "utf-8",
  );
  await fs.writeFile(
    path.join(rootDir, EVOLVE_POLICY_FILE),
    JSON.stringify(validated.policies.evolve, null, 2),
    "utf-8",
  );

  const mcpServers: MCPServerConfig[] = validated.mcpServers.map((server) => ({
    name: server.name,
    command: server.command,
    args: server.args,
    enabled: server.enabled,
    createdAt: server.createdAt || new Date().toISOString(),
  }));
  await fs.writeFile(path.join(rootDir, MCP_FILE), JSON.stringify({ servers: mcpServers }, null, 2), "utf-8");

  if (validated.channels.telegram.enabled) {
    await ensureChannelGatewaySkill(rootDir, "telegram");
  }
  if (validated.channels.whatsapp.enabled) {
    await ensureChannelGatewaySkill(rootDir, "whatsapp");
  }

  await writeControlPlane(rootDir, validated);
}

export async function getEvolvePolicy(rootDir: string): Promise<{ enforceApprovals: boolean }> {
  const policyPath = path.join(rootDir, EVOLVE_POLICY_FILE);
  const policy = await readJsonOrDefault<{ enforceApprovals?: boolean }>(policyPath, defaultEvolvePolicy);
  return {
    enforceApprovals: Boolean(policy.enforceApprovals),
  };
}
