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

  pi.registerTool({
    name: "install_skill",
    label: "Install Skill",
    description: "Install a skill from a local path or repository URL into active limbs.",
    parameters: Type.Object({
      source: Type.String({ description: "Local path or git repository URL" }),
      name: Type.Optional(Type.String({ description: "Optional installed skill name override" })),
      subdir: Type.Optional(Type.String({ description: "Optional skill subdirectory in source" })),
      approveUntrusted: Type.Optional(Type.Boolean({ description: "Approve install from untrusted repo host" })),
    }),
    async execute(_toolCallId, params) {
      const { installSkillFromSource } = await import("./system/skills.js");
      try {
        const installedPath = await installSkillFromSource(
          rootDir,
          params.source,
          params.name,
          params.subdir,
          { approveUntrusted: Boolean(params.approveUntrusted) },
        );
        return {
          content: [{ type: "text", text: `✅ Installed skill from ${params.source}` }],
          details: { success: true, installedPath, error: "" },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `❌ Skill install failed: ${error.message}` }],
          details: { success: false, installedPath: "", error: String(error.message || error) },
        };
      }
    },
  });

  pi.registerTool({
    name: "evolve_goal",
    label: "Evolve Goal",
    description: "Plan or execute evolution actions from a natural-language goal.",
    parameters: Type.Object({
      goal: Type.String({ description: "Natural-language goal" }),
      execute: Type.Optional(Type.Boolean({ description: "Execute planned actions if true" })),
      requireApproval: Type.Optional(Type.Boolean({ description: "Require approval for risky actions" })),
      approvePlan: Type.Optional(Type.Boolean({ description: "Approve risky actions when required" })),
      approveUntrusted: Type.Optional(Type.Boolean({ description: "Approve untrusted repo installs" })),
      skillSubdir: Type.Optional(Type.String({ description: "Optional skill subdirectory for install actions" })),
    }),
    async execute(_toolCallId, params) {
      const { planEvolution, executeEvolutionPlan, listRiskyEvolveActions } = await import("./system/evolve.js");
      const plan = planEvolution(params.goal);
      const risky = listRiskyEvolveActions(plan);
      if (!params.execute) {
        return {
          content: [{ type: "text", text: `🧬 Planned ${plan.actions.length} action(s).` }],
          details: { success: true, plan, results: [] as any[], error: "" },
        };
      }
      if (params.requireApproval && risky.length > 0 && !params.approvePlan) {
        return {
          content: [{ type: "text", text: "❌ Approval required for risky evolution actions." }],
          details: {
            success: false,
            plan,
            results: [] as any[],
            error: `Approval required for: ${risky.map((action) => action.type).join(", ")}`,
          },
        };
      }
      const results = await executeEvolutionPlan(rootDir, plan, {
        approveUntrusted: Boolean(params.approveUntrusted),
        skillSubdir: params.skillSubdir,
      });
      const failed = results.filter((r) => !r.success);
      return {
        content: [
          {
            type: "text",
            text: failed.length
              ? `❌ Evolution execution completed with ${failed.length} failure(s).`
              : "✅ Evolution execution completed successfully.",
          },
        ],
        details: {
          success: failed.length === 0,
          plan,
          results,
          error: failed.map((f) => f.message).join("; "),
        },
      };
    },
  });

  pi.registerTool({
    name: "autonomy_loop",
    label: "Autonomy Loop",
    description: "Run a bounded autonomous multi-step evolution loop.",
    parameters: Type.Object({
      goal: Type.String({ description: "High-level objective" }),
      execute: Type.Optional(Type.Boolean({ description: "Execute planned steps if true" })),
      maxSteps: Type.Optional(Type.Number({ description: "Maximum planned steps (default 5)" })),
      requireApproval: Type.Optional(Type.Boolean({ description: "Require approval for risky steps" })),
      approvePlan: Type.Optional(Type.Boolean({ description: "Approve risky steps when required" })),
      approveUntrusted: Type.Optional(Type.Boolean({ description: "Approve untrusted repo installs" })),
      skillSubdir: Type.Optional(Type.String({ description: "Optional skill subdirectory for install actions" })),
    }),
    async execute(_toolCallId, params) {
      const { runAutonomousEvolution } = await import("./system/autonomy.js");
      const result = await runAutonomousEvolution(rootDir, params.goal, {
        execute: Boolean(params.execute),
        maxSteps: params.maxSteps ? Number(params.maxSteps) : undefined,
        enforceApprovals: Boolean(params.requireApproval),
        approvePlan: Boolean(params.approvePlan),
        approveUntrusted: Boolean(params.approveUntrusted),
        skillSubdir: params.skillSubdir,
      });
      return {
        content: [
          {
            type: "text",
            text: result.ok
              ? `✅ Autonomy loop completed (${result.steps.length} step(s)).`
              : `❌ Autonomy loop stopped: ${result.stoppedReason || "failure"}.`,
          },
        ],
        details: result,
      };
    },
  });
}
