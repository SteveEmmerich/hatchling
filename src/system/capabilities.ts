import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface CapabilityState {
  enabled: boolean;
  updatedAt: string;
  metadata: Record<string, any>;
}

export interface CapabilityRegistry {
  capabilities: Record<string, CapabilityState>;
}

const CAPABILITY_FILE = "brain/capabilities.json";

const DEFAULT_CAPABILITIES = [
  "chat.hindbrain",
  "chat.openai",
  "chat.anthropic",
  "chat.ollama",
  "channel.web",
  "channel.telegram",
  "channel.whatsapp",
] as const;

function defaultRegistry(): CapabilityRegistry {
  const now = new Date().toISOString();
  const capabilities: Record<string, CapabilityState> = {};
  for (const name of DEFAULT_CAPABILITIES) {
    capabilities[name] = {
      enabled: name === "chat.hindbrain" || name === "channel.web",
      updatedAt: now,
      metadata: {},
    };
  }
  return { capabilities };
}

async function registryPath(rootDir: string): Promise<string> {
  return path.join(rootDir, CAPABILITY_FILE);
}

export async function loadCapabilities(rootDir: string): Promise<CapabilityRegistry> {
  const target = await registryPath(rootDir);
  if (!existsSync(target)) {
    return defaultRegistry();
  }
  try {
    const parsed = JSON.parse(await fs.readFile(target, "utf-8")) as CapabilityRegistry;
    if (!parsed || typeof parsed !== "object" || !parsed.capabilities) {
      return defaultRegistry();
    }
    return parsed;
  } catch {
    return defaultRegistry();
  }
}

export async function saveCapabilities(rootDir: string, registry: CapabilityRegistry): Promise<void> {
  const target = await registryPath(rootDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(registry, null, 2), "utf-8");
}

async function updateConfigProvider(
  rootDir: string,
  provider: string,
  model: string,
): Promise<void> {
  const configPath = path.join(rootDir, "brain", "config.json");
  let config: Record<string, any> = {};
  try {
    config = JSON.parse(await fs.readFile(configPath, "utf-8"));
  } catch {
    config = {};
  }
  config.provider = provider;
  config.model = model;
  config.lastActive = new Date().toISOString();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

export async function listCapabilities(rootDir: string): Promise<CapabilityRegistry> {
  const registry = await loadCapabilities(rootDir);
  await saveCapabilities(rootDir, registry);
  return registry;
}

export async function setCapabilityState(
  rootDir: string,
  name: string,
  enabled: boolean,
  metadata: Record<string, any> = {},
): Promise<CapabilityState> {
  const registry = await loadCapabilities(rootDir);
  const now = new Date().toISOString();
  registry.capabilities[name] = {
    enabled,
    updatedAt: now,
    metadata,
  };
  await saveCapabilities(rootDir, registry);
  return registry.capabilities[name];
}

export async function enableCapability(
  rootDir: string,
  name: string,
  options: { provider?: string; model?: string } = {},
): Promise<CapabilityState> {
  const normalized = name.trim().toLowerCase();
  const next = await setCapabilityState(rootDir, normalized, true, options);

  if (normalized.startsWith("chat.")) {
    const provider = options.provider || normalized.split(".")[1] || "hindbrain";
    const modelDefaults: Record<string, string> = {
      hindbrain: "hindbrain-1b",
      openai: "gpt-4o",
      anthropic: "claude-3-5-sonnet-20241022",
      ollama: "llama3.2",
    };
    const model = options.model || modelDefaults[provider] || "hindbrain-1b";
    await updateConfigProvider(rootDir, provider, model);
  }

  return next;
}

export async function disableCapability(rootDir: string, name: string): Promise<CapabilityState> {
  const normalized = name.trim().toLowerCase();
  return setCapabilityState(rootDir, normalized, false);
}
