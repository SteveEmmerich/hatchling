import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  createdAt: string;
}

interface MCPRegistry {
  servers: MCPServerConfig[];
}

const REGISTRY_FILE = "brain/mcp_servers.json";

function validateName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    throw new Error("MCP server name must contain only lowercase letters, numbers, dashes, and underscores.");
  }
  return normalized;
}

async function readRegistry(rootDir: string): Promise<MCPRegistry> {
  const registryPath = path.join(rootDir, REGISTRY_FILE);
  if (!existsSync(registryPath)) {
    return { servers: [] };
  }
  const parsed = JSON.parse(await fs.readFile(registryPath, "utf-8")) as MCPRegistry;
  if (!Array.isArray(parsed.servers)) {
    return { servers: [] };
  }
  return parsed;
}

async function writeRegistry(rootDir: string, registry: MCPRegistry): Promise<void> {
  const registryPath = path.join(rootDir, REGISTRY_FILE);
  await fs.mkdir(path.dirname(registryPath), { recursive: true });
  await fs.writeFile(registryPath, JSON.stringify(registry, null, 2), "utf-8");
}

export async function listMCPServers(rootDir: string): Promise<MCPServerConfig[]> {
  const registry = await readRegistry(rootDir);
  return [...registry.servers].sort((a, b) => a.name.localeCompare(b.name));
}

export async function addMCPServer(
  rootDir: string,
  name: string,
  command: string,
  args: string[] = [],
): Promise<MCPServerConfig> {
  const normalized = validateName(name);
  const cleanedCommand = command.trim();
  if (!cleanedCommand) {
    throw new Error("MCP server command is required.");
  }

  const registry = await readRegistry(rootDir);
  if (registry.servers.some((server) => server.name === normalized)) {
    throw new Error(`MCP server '${normalized}' already exists.`);
  }

  const config: MCPServerConfig = {
    name: normalized,
    command: cleanedCommand,
    args: args.map((arg) => String(arg)),
    enabled: true,
    createdAt: new Date().toISOString(),
  };
  registry.servers.push(config);
  await writeRegistry(rootDir, registry);
  return config;
}

export async function removeMCPServer(rootDir: string, name: string): Promise<boolean> {
  const normalized = validateName(name);
  const registry = await readRegistry(rootDir);
  const before = registry.servers.length;
  registry.servers = registry.servers.filter((server) => server.name !== normalized);
  if (registry.servers.length === before) return false;
  await writeRegistry(rootDir, registry);
  return true;
}

export async function exportMCPServersForPi(rootDir: string): Promise<Record<string, { command: string; args: string[] }>> {
  const servers = await listMCPServers(rootDir);
  const exported: Record<string, { command: string; args: string[] }> = {};
  for (const server of servers) {
    if (!server.enabled) continue;
    exported[server.name] = {
      command: server.command,
      args: server.args,
    };
  }
  return exported;
}
