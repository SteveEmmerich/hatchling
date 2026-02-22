import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import path from "path";
import fs from "fs/promises";

export default function (pi: ExtensionAPI) {
  const rootDir = process.env.HATCHLING_INSTANCE_PATH || process.cwd();
  process.env.HATCHLING_INTERNAL_WRITE ||= "1";

  pi.on("session_start", async (_event, ctx) => {
    const { PathGuard } = await import("./system/pathGuard.js");
    PathGuard.setRoot(rootDir);
    if (process.env.HATCHLING_AUTONOMIC_MAINTENANCE !== "0") {
      const { startMaintenanceLoop } = await import("./system/maintenance.js");
      await startMaintenanceLoop(rootDir);
    }

    try {
      const configPath = path.join(rootDir, "brain", "config.json");
      const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
      const model = ctx.modelRegistry.find(config.provider, config.model);
      if (model) {
        const ok = await pi.setModel(model);
        if (!ok) {
          ctx.ui.notify(
            `Model ${config.provider}/${config.model} is configured but unavailable (missing credentials).`,
            "warning",
          );
        }
      }
    } catch {
      // Use existing model when instance config is missing.
    }

    try {
      const { getAgentName } = await import("./system/soul.js");
      const name = await getAgentName(rootDir);
      ctx.ui.notify(`✅ ${name} is awake and ready.`, "info");
    } catch {
      ctx.ui.notify("✅ Hatchling is awake and ready.", "info");
    }
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    const { PathGuard } = await import("./system/pathGuard.js");
    PathGuard.setRoot(rootDir);
    const { assemblePrompt } = await import("./system/soul.js");
    const systemPrompt = await assemblePrompt(rootDir);
    return {
      systemPrompt: `${event.systemPrompt}\n\n${systemPrompt}`,
    };
  });

  pi.registerCommand("vitals", {
    description: "Show hatchling vitals and lineage status",
    handler: async (_args, ctx) => {
      const { getVitals } = await import("./system/vitals.js");
      const { getLineageInfo } = await import("./organism/evolution.js");
      const vitals = await getVitals();
      const lineage = await getLineageInfo(rootDir);
      ctx.ui.notify(vitals, "info");
      ctx.ui.notify(
        `Lineage: ${lineage.mutations} local mutations, ${lineage.divergence} commits behind germline.`,
        "info",
      );
    },
  });

  pi.registerCommand("sleep", {
    description: "Run one sleep consolidation cycle",
    handler: async (_args, ctx) => {
      const { sleep } = await import("./system/sleep.js");
      await sleep();
      ctx.ui.notify("Sleep cycle complete.", "info");
    },
  });

  pi.registerCommand("maintenance", {
    description: "Run one autonomous maintenance tick now",
    handler: async (_args, ctx) => {
      const { runMaintenanceTick } = await import("./system/maintenance.js");
      const report = await runMaintenanceTick(rootDir);
      ctx.ui.notify(
        `Maintenance tick: lowEnergy=${report.lowEnergy}, autoSleep=${report.autoSleepTriggered}, pruned=${report.telemetryPruned}`,
        "info",
      );
    },
  });

  pi.registerCommand("good", {
    description: "Record positive reinforcement",
    handler: async (args, ctx) => {
      const { recordFeedback } = await import("./system/feedback.js");
      const result = await recordFeedback("positive", args || undefined);
      ctx.ui.notify(`✅ ${result.message}`, "info");
    },
  });

  pi.registerCommand("bad", {
    description: "Record negative reinforcement",
    handler: async (args, ctx) => {
      const { recordFeedback } = await import("./system/feedback.js");
      const result = await recordFeedback("negative", args || undefined);
      ctx.ui.notify(`❌ ${result.message}`, "warning");
    },
  });

  pi.registerTool({
    name: "mutate_self",
    label: "Mutate Self",
    description: "Modify one file under src/ and run TypeScript integrity checks.",
    parameters: Type.Object({
      filePath: Type.String({ description: "Path under src/, e.g. system/pathGuard.ts" }),
      content: Type.String({ description: "Full replacement file contents" }),
      reason: Type.String({ description: "Why this mutation is required" }),
    }),
    async execute(_toolCallId, params) {
      const { mutate } = await import("./organism/evolution.js");
      const result = await mutate(rootDir, params.filePath, params.content);
      return {
        content: [
          {
            type: "text",
            text: result.success
              ? `✅ Mutation succeeded: ${params.filePath}`
              : `❌ Mutation failed: ${result.message}`,
          },
        ],
        details: { reason: params.reason, ...result },
      };
    },
  });

  pi.registerTool({
    name: "sync_germline",
    label: "Sync Germline",
    description: "Fetch and merge updates from the germline remote.",
    parameters: Type.Object({}),
    async execute() {
      const { recombine } = await import("./organism/evolution.js");
      const result = await recombine(rootDir);
      return {
        content: [
          {
            type: "text",
            text: result.success
              ? "✅ Recombined with germline."
              : `❌ Recombination failed: ${result.message}`,
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "generate_backup",
    label: "Generate Backup",
    description: "Create a git bundle snapshot of this instance.",
    parameters: Type.Object({}),
    async execute() {
      const { createSnapshot } = await import("./system/backup.js");
      try {
        const bundlePath = await createSnapshot();
        return {
          content: [{ type: "text", text: `✅ Backup snapshot completed: ${bundlePath}` }],
          details: { success: true, bundlePath, error: "" },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `❌ Backup snapshot failed: ${error.message}` }],
          details: { success: false, bundlePath: "", error: String(error.message || error) },
        };
      }
    },
  });
}
