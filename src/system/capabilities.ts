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

export interface ProviderReadiness {
  ok: boolean;
  message: string;
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

export async function getActiveProvider(rootDir: string): Promise<{ provider: string; model: string }> {
  const configPath = path.join(rootDir, "brain", "config.json");
  const config = await readConfig(configPath);
  return {
    provider: String(config.provider || "hindbrain"),
    model: String(config.model || "hindbrain-1b"),
  };
}

async function readConfig(configPath: string): Promise<Record<string, any>> {
  try {
    return JSON.parse(await fs.readFile(configPath, "utf-8"));
  } catch {
    return {};
  }
}

export async function setActiveProvider(rootDir: string, provider: string, model: string): Promise<void> {
  await updateConfigProvider(rootDir, provider, model);
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

export function checkProviderReadiness(provider: string): ProviderReadiness {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "hindbrain") {
    return { ok: true, message: "Hindbrain is always locally available." };
  }
  if (normalized === "openai") {
    return process.env.OPENAI_API_KEY
      ? { ok: true, message: "OPENAI_API_KEY detected." }
      : { ok: false, message: "OPENAI_API_KEY is required to enable OpenAI chat." };
  }
  if (normalized === "anthropic") {
    return process.env.ANTHROPIC_API_KEY
      ? { ok: true, message: "ANTHROPIC_API_KEY detected." }
      : { ok: false, message: "ANTHROPIC_API_KEY is required to enable Anthropic chat." };
  }
  if (normalized === "ollama") {
    return { ok: true, message: "Ollama provider enabled (availability checked at runtime)." };
  }
  return { ok: false, message: `Unknown provider '${provider}'.` };
}

export async function enableCapability(
  rootDir: string,
  name: string,
  options: { provider?: string; model?: string; skipReadinessCheck?: boolean } = {},
): Promise<CapabilityState> {
  const normalized = name.trim().toLowerCase();
  let provider = options.provider || normalized.split(".")[1] || "hindbrain";
  if (normalized.startsWith("chat.")) {
    provider = options.provider || normalized.split(".")[1] || "hindbrain";
    if (!options.skipReadinessCheck) {
      const readiness = checkProviderReadiness(provider);
      if (!readiness.ok) {
        throw new Error(readiness.message);
      }
    }
  }

  const next = await setCapabilityState(rootDir, normalized, true, { ...options, provider });

  if (normalized.startsWith("chat.")) {
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
