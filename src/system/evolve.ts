import fs from "fs/promises";
import path from "path";
import { installSkillFromSource } from "./skills.js";
import { addMCPServer, removeMCPServer } from "./mcp.js";
import { runMaintenanceTick } from "./maintenance.js";
import { mutate } from "../organism/evolution.js";
import {
  enableCapability,
  getActiveProvider,
  loadCapabilities,
  setActiveProvider,
  setCapabilityState,
} from "./capabilities.js";
import { bootstrapChannelCapability } from "./channels.js";
import {
  getRollbackCandidate,
  markRunRolledBack,
  recordEvolutionRun,
  type EvolutionUndoAction,
  type EvolutionRunRecord,
} from "./evolve-journal.js";

export interface EvolveAction {
  type: "install_skill" | "add_mcp" | "mutate_web_limb" | "maintenance_tick" | "enable_capability" | "bootstrap_channel";
  params: Record<string, any>;
  reason: string;
}

export interface EvolvePlan {
  goal: string;
  actions: EvolveAction[];
}

export interface EvolveExecutionResult {
  type: string;
  success: boolean;
  message: string;
}

function findRepoSource(goal: string): string | null {
  const patterns = [
    /(https?:\/\/[^\s'"]+)/i,
    /(git@[^\s'"]+\.git)/i,
    /(file:\/\/[^\s'"]+)/i,
    /([A-Za-z0-9._/-]+\.git)/,
  ];
  for (const pattern of patterns) {
    const match = goal.match(pattern);
    if (match && match[1]) return match[1];
  }
  return null;
}

function actionKey(action: EvolveAction): string {
  return `${action.type}:${JSON.stringify(action.params || {})}`;
}

function dedupeActions(actions: EvolveAction[]): EvolveAction[] {
  const seen = new Set<string>();
  const deduped: EvolveAction[] = [];
  for (const action of actions) {
    const key = actionKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }
  return deduped;
}

function resolvePlanDependencies(actions: EvolveAction[]): EvolveAction[] {
  const hasChatEnable = actions.some(
    (action) => action.type === "enable_capability" && String(action.params?.name || "").startsWith("chat."),
  );
  const hasChannelBootstrap = actions.some((action) => action.type === "bootstrap_channel");

  const resolved = [...actions];
  if (hasChannelBootstrap && !hasChatEnable) {
    resolved.unshift({
      type: "enable_capability",
      params: {
        name: "chat.hindbrain",
        provider: "hindbrain",
        model: "hindbrain-1b",
      },
      reason: "Dependency: channel gateways require at least one enabled chat provider.",
    });
  }

  return dedupeActions(resolved);
}

export function planEvolution(goal: string): EvolvePlan {
  const normalized = goal.toLowerCase();
  const actions: EvolveAction[] = [];
  const repoSource = findRepoSource(goal);

  if (repoSource || normalized.includes("install skill")) {
    actions.push({
      type: "install_skill",
      params: {
        source: repoSource || "",
      },
      reason: "Goal references adding external capability via skill installation.",
    });
  }

  if (normalized.includes("mcp") && normalized.includes("filesystem")) {
    actions.push({
      type: "add_mcp",
      params: {
        name: "filesystem",
        command: "npx",
        args: ["@modelcontextprotocol/server-filesystem", "/tmp"],
      },
      reason: "Goal references MCP filesystem capability.",
    });
  }

  if (
    normalized.includes("web interface")
    || normalized.includes("dashboard")
    || normalized.includes("web ui")
  ) {
    actions.push({
      type: "mutate_web_limb",
      params: {
        filePath: "system/web-limb-generated.ts",
      },
      reason: "Goal references generating or evolving a web interface.",
    });
  }

  if (
    normalized.includes("sleep")
    || normalized.includes("maintenance")
    || normalized.includes("compact")
  ) {
    actions.push({
      type: "maintenance_tick",
      params: {},
      reason: "Goal references maintenance/sleep/compaction behavior.",
    });
  }

  if (normalized.includes("claude") || normalized.includes("anthropic")) {
    actions.push({
      type: "enable_capability",
      params: {
        name: "chat.anthropic",
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
      },
      reason: "Goal references Claude/Anthropic chat capability.",
    });
  } else if (normalized.includes("openai") || normalized.includes("gpt")) {
    actions.push({
      type: "enable_capability",
      params: {
        name: "chat.openai",
        provider: "openai",
        model: "gpt-4o",
      },
      reason: "Goal references OpenAI/GPT chat capability.",
    });
  } else if (normalized.includes("ollama")) {
    actions.push({
      type: "enable_capability",
      params: {
        name: "chat.ollama",
        provider: "ollama",
        model: "llama3.2",
      },
      reason: "Goal references Ollama chat capability.",
    });
  }

  if (normalized.includes("telegram")) {
    actions.push({
      type: "bootstrap_channel",
      params: {
        channel: "telegram",
      },
      reason: "Goal references Telegram communication.",
    });
  }
  if (normalized.includes("whatsapp")) {
    actions.push({
      type: "bootstrap_channel",
      params: {
        channel: "whatsapp",
      },
      reason: "Goal references WhatsApp communication.",
    });
  }

  return { goal, actions: resolvePlanDependencies(actions) };
}

function generatedWebLimbContent(goal: string): string {
  const safeTitle = goal.replace(/`/g, "").slice(0, 80);
  return [
    "export function renderGeneratedWebLimb(): string {",
    `  const title = ${JSON.stringify(safeTitle || "Hatchling Web Limb")};`,
    "  return `<!doctype html><html><head><meta charset=\"utf-8\" /><title>${title}</title></head><body><h1>${title}</h1><p>Generated by evolve planner.</p></body></html>`;",
    "}",
    "",
  ].join("\n");
}

export function isRiskyEvolveAction(action: EvolveAction): boolean {
  return action.type === "install_skill"
    || action.type === "mutate_web_limb"
    || action.type === "add_mcp"
    || action.type === "enable_capability"
    || action.type === "bootstrap_channel";
}

export function listRiskyEvolveActions(plan: EvolvePlan): EvolveAction[] {
  return plan.actions.filter((action) => isRiskyEvolveAction(action));
}

function randomRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function executeEvolutionPlan(
  rootDir: string,
  plan: EvolvePlan,
  options: { approveUntrusted?: boolean; skillSubdir?: string; runId?: string } = {},
): Promise<EvolveExecutionResult[]> {
  const results: EvolveExecutionResult[] = [];
  const undo: EvolutionUndoAction[] = [];
  const runId = options.runId || randomRunId();

  for (const action of plan.actions) {
    try {
      if (action.type === "install_skill") {
        const source = String(action.params.source || "").trim();
        if (!source) {
          results.push({
            type: action.type,
            success: false,
            message: "No skill source found in goal. Include a path or repo URL.",
          });
          continue;
        }
        const installedPath = await installSkillFromSource(
          rootDir,
          source,
          undefined,
          options.skillSubdir,
          { approveUntrusted: Boolean(options.approveUntrusted) },
        );
        undo.push({
          type: "remove_path",
          data: { path: installedPath },
        });
        results.push({
          type: action.type,
          success: true,
          message: `Installed skill at ${installedPath}`,
        });
      } else if (action.type === "add_mcp") {
        const added = await addMCPServer(
          rootDir,
          String(action.params.name),
          String(action.params.command),
          Array.isArray(action.params.args) ? action.params.args.map((arg: any) => String(arg)) : [],
        );
        undo.push({
          type: "remove_mcp",
          data: { name: added.name },
        });
        results.push({
          type: action.type,
          success: true,
          message: `Added MCP server ${added.name}`,
        });
      } else if (action.type === "mutate_web_limb") {
        const filePath = String(action.params.filePath || "system/web-limb-generated.ts");
        const normalizedPath = filePath.startsWith("src/") ? filePath : `src/${filePath}`;
        const fullPath = path.join(rootDir, normalizedPath);
        let existed = false;
        let previousContent = "";
        try {
          previousContent = await fs.readFile(fullPath, "utf-8");
          existed = true;
        } catch {
          existed = false;
        }

        const mutation = await mutate(rootDir, filePath, generatedWebLimbContent(plan.goal));
        if (mutation.success) {
          undo.push({
            type: "restore_file",
            data: {
              path: fullPath,
              existed,
              content: previousContent,
            },
          });
        }
        results.push({
          type: action.type,
          success: mutation.success,
          message: mutation.message,
        });
      } else if (action.type === "maintenance_tick") {
        const report = await runMaintenanceTick(rootDir);
        results.push({
          type: action.type,
          success: true,
          message: `Maintenance complete (autoSleep=${report.autoSleepTriggered}, pruned=${report.telemetryPruned})`,
        });
      } else if (action.type === "enable_capability") {
        const name = String(action.params.name);
        const caps = await loadCapabilities(rootDir);
        const previousCap = caps.capabilities[name] || { enabled: false, metadata: {} };
        const previousProvider = await getActiveProvider(rootDir);

        const state = await enableCapability(rootDir, name, {
          provider: action.params.provider ? String(action.params.provider) : undefined,
          model: action.params.model ? String(action.params.model) : undefined,
        });

        undo.push({
          type: "restore_capability",
          data: {
            name,
            enabled: previousCap.enabled,
            metadata: previousCap.metadata || {},
          },
        });
        undo.push({
          type: "restore_provider",
          data: {
            provider: previousProvider.provider,
            model: previousProvider.model,
          },
        });

        results.push({
          type: action.type,
          success: true,
          message: `Capability ${String(action.params.name)} ${state.enabled ? "enabled" : "disabled"}`,
        });
      } else if (action.type === "bootstrap_channel") {
        const channel = String(action.params.channel || "").trim().toLowerCase();
        const capName = `channel.${channel}`;
        const caps = await loadCapabilities(rootDir);
        const capBefore = caps.capabilities[capName] || { enabled: false, metadata: {} };

        const result = await bootstrapChannelCapability(rootDir, channel);
        if (result.createdGateway) {
          undo.push({
            type: "remove_path",
            data: { path: result.skillPath },
          });
        }
        if (result.createdSharedSkill) {
          undo.push({
            type: "remove_path",
            data: { path: result.sharedSkillPath },
          });
        }
        undo.push({
          type: "restore_capability",
          data: {
            name: capName,
            enabled: capBefore.enabled,
            metadata: capBefore.metadata || {},
          },
        });

        results.push({
          type: action.type,
          success: true,
          message: `Bootstrapped ${result.channel} channel (${result.skillPath})`,
        });
      }
    } catch (error: any) {
      results.push({
        type: action.type,
        success: false,
        message: String(error.message || error),
      });
    }
  }

  const runRecord: EvolutionRunRecord = {
    runId,
    goal: plan.goal,
    createdAt: new Date().toISOString(),
    actions: plan.actions.map((action) => ({
      type: action.type,
      params: action.params,
      reason: action.reason,
    })),
    results,
    undo,
  };
  await recordEvolutionRun(rootDir, runRecord);

  return results;
}

export async function rollbackEvolution(rootDir: string, runId?: string): Promise<{
  ok: boolean;
  runId: string;
  results: EvolveExecutionResult[];
}> {
  const candidate = await getRollbackCandidate(rootDir, runId);
  if (!candidate) {
    throw new Error("No rollback candidate found.");
  }

  const results: EvolveExecutionResult[] = [];
  const undoActions = [...candidate.undo].reverse();
  for (const undo of undoActions) {
    try {
      if (undo.type === "remove_path") {
        await fs.rm(String(undo.data.path), { recursive: true, force: true });
        results.push({ type: undo.type, success: true, message: `Removed ${String(undo.data.path)}` });
      } else if (undo.type === "remove_mcp") {
        await removeMCPServer(rootDir, String(undo.data.name));
        results.push({ type: undo.type, success: true, message: `Removed MCP ${String(undo.data.name)}` });
      } else if (undo.type === "restore_capability") {
        await setCapabilityState(
          rootDir,
          String(undo.data.name),
          Boolean(undo.data.enabled),
          (undo.data.metadata || {}) as Record<string, any>,
        );
        results.push({ type: undo.type, success: true, message: `Restored capability ${String(undo.data.name)}` });
      } else if (undo.type === "restore_provider") {
        await setActiveProvider(rootDir, String(undo.data.provider), String(undo.data.model));
        results.push({ type: undo.type, success: true, message: `Restored provider ${String(undo.data.provider)}` });
      } else if (undo.type === "restore_file") {
        const fullPath = String(undo.data.path);
        if (undo.data.existed) {
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, String(undo.data.content || ""), "utf-8");
          results.push({ type: undo.type, success: true, message: `Restored file ${fullPath}` });
        } else {
          await fs.rm(fullPath, { force: true });
          results.push({ type: undo.type, success: true, message: `Removed generated file ${fullPath}` });
        }
      }
    } catch (error: any) {
      results.push({
        type: undo.type,
        success: false,
        message: String(error.message || error),
      });
    }
  }

  await markRunRolledBack(rootDir, candidate.runId);
  return {
    ok: results.every((result) => result.success),
    runId: candidate.runId,
    results,
  };
}
