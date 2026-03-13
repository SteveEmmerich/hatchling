import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import path from "path";
import fs from "fs/promises";

export default function (pi: ExtensionAPI) {
  const rootDir = process.env.HATCHLING_INSTANCE_PATH || process.cwd();
  delete process.env.HATCHLING_INTERNAL_WRITE;
  delete process.env.HATCHLING_CONTEXT;
  const withInternalWrite = async <T,>(fn: () => Promise<T>): Promise<T> => {
    const previous = process.env.HATCHLING_INTERNAL_WRITE;
    process.env.HATCHLING_INTERNAL_WRITE = "1";
    try {
      return await fn();
    } finally {
      if (previous === undefined) {
        delete process.env.HATCHLING_INTERNAL_WRITE;
      } else {
        process.env.HATCHLING_INTERNAL_WRITE = previous;
      }
    }
  };

  const extractTextFromContent = (content: any): string => {
    if (!content) return "";
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content
        .filter((item) => item && item.type === "text")
        .map((item) => String(item.text || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();
    }
    return "";
  };

  const extractLastUserText = (entries: any[]): string => {
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry?.type === "message" && entry?.message?.role === "user") {
        const text = extractTextFromContent(entry.message.content);
        if (text) return text;
      }
    }
    return "";
  };

  pi.on("session_start", async (_event, ctx) => {
    const { PathGuard } = await import("./system/pathGuard.js");
    PathGuard.setRoot(rootDir);
    if (process.env.HATCHLING_AUTONOMIC_MAINTENANCE !== "0") {
      const { startMaintenanceLoop } = await import("./system/maintenance.js");
      await startMaintenanceLoop(rootDir);
    }
    if (process.env.HATCHLING_CHANNEL_RUNTIME !== "0") {
      try {
        const { loadCapabilities } = await import("./system/capabilities.js");
        const { startChannelRuntimeLoop } = await import("./system/channel-runtime.js");
        const caps = await loadCapabilities(rootDir);
        if (caps.capabilities["channel.telegram"]?.enabled) {
          await startChannelRuntimeLoop(rootDir, "telegram");
        }
        if (caps.capabilities["channel.whatsapp"]?.enabled) {
          await startChannelRuntimeLoop(rootDir, "whatsapp");
        }
      } catch {
        // Channel runtime is optional; continue if setup fails.
      }
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

  pi.on("turn_end", async (event, ctx) => {
    if (process.env.HATCHLING_REFLEX_CHECK === "0" || process.env.HATCHLING_CORE_REFLEX_CHECK === "0") {
      return;
    }
    const message = event.message as any;
    if (!message || message.role !== "assistant") return;
    const assistantText = extractTextFromContent(message.content);
    if (!assistantText) return;
    const userText = extractLastUserText(ctx.sessionManager.getEntries() as any[]);
    if (!userText) return;

    const { reflexCheck } = await import("./brain/hindbrain.js");
    const { loadCompleteIdentity } = await import("./system/soul.js");
    const { recordCreatureEvent } = await import("./system/creature-events.js");
    const dnaContext = await loadCompleteIdentity(rootDir);
    const check = await reflexCheck(userText, assistantText, dnaContext);
    if (!check.safe) {
      await recordCreatureEvent(
        rootDir,
        "immune_block",
        `core response blocked${check.reason ? `: ${check.reason}` : ""}`,
      );
      const safeText = check.modifiedResponse?.trim() || "";
      const content = safeText
        ? `🛡️ Immune system intervened. Safe response:\n${safeText}`
        : `🛡️ Immune system blocked the prior response. Reason: ${check.reason || "unspecified"}`;
      pi.sendMessage({
        customType: "immune-block",
        content,
        display: true,
        details: { reason: check.reason || "" },
      });
    }
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

  pi.registerCommand("pet", {
    description: "Show animated hatchling creature frames in the TUI stream (e.g. /pet frames=12 delay=180)",
    handler: async (args, ctx) => {
      const parseArg = (name: string, fallback: number): number => {
        const match = String(args || "").match(new RegExp(`${name}=(\\d+)`, "i"));
        if (!match || !match[1]) return fallback;
        const parsed = Number(match[1]);
        if (!Number.isFinite(parsed)) return fallback;
        return parsed;
      };
      const frames = Math.max(1, Math.min(40, parseArg("frames", 12)));
      const delay = Math.max(50, Math.min(2000, parseArg("delay", 180)));

      const { PathGuard } = await import("./system/pathGuard.js");
      const { renderCreature, renderCreatureAnimationFrames } = await import("./system/creature.js");
      const { loadGenome } = await import("./system/creature-genome.js");
      const { summarizeCreatureEvents } = await import("./system/creature-events.js");
      const { checkHealth } = await import("./system/health.js");
      PathGuard.setRoot(rootDir);

      const readJsonOrDefault = async <T,>(relativePath: string, fallback: T): Promise<T> => {
        try {
          const fullPath = await PathGuard.validatePath(relativePath, "read");
          return JSON.parse(await fs.readFile(fullPath, "utf-8")) as T;
        } catch {
          return fallback;
        }
      };

      const config = await readJsonOrDefault("brain/config.json", { name: "hatchling", createdAt: rootDir });
      const mutationState = await readJsonOrDefault("brain/mutation_state.json", {
        sleepCycles: 0,
        successfulMutations: 0,
        totalMutations: 0,
      });
      const curiosity = await readJsonOrDefault("brain/curiosity_state.json", { adjustedCuriosity: 5 });
      const quotas = await readJsonOrDefault("brain/quotas.json", { tokens: { today: 0, maxPerDay: 100000 } });
      const heartbeat = await readJsonOrDefault("brain/heartbeat.json", { lowEnergy: false });
      const health = await checkHealth();
      const tokenUsagePercent = (quotas.tokens.today / quotas.tokens.maxPerDay) * 100;
      const energyLevel = tokenUsagePercent > 90 ? "Critical" : tokenUsagePercent > 70 ? "Low" : "High";
      const seed = `${config.name || "hatchling"}:${config.createdAt || rootDir}`;
      const genome = await loadGenome(rootDir, seed);
      const creature = renderCreature({
        seed,
        commitCount: 1,
        sleepCycles: Number(mutationState.sleepCycles || 0),
        successfulMutations: Number(mutationState.successfulMutations || 0),
        totalMutations: Number(mutationState.totalMutations || 0),
        curiosity: Number(curiosity.adjustedCuriosity || 5),
        energyLevel,
        safeMode: Boolean(health.safeMode),
        lowEnergy: Boolean(heartbeat.lowEnergy),
        palette: genome.palette,
        body: genome.body,
        eyes: genome.eyes,
        accent: genome.accent,
      });
      const creatureEvents = await summarizeCreatureEvents(rootDir);

      const animationFrames = renderCreatureAnimationFrames(creature, frames, creatureEvents.recentTypes);
      for (const frame of animationFrames) {
        ctx.ui.notify(
          [`🧸 ${creature.stage} (${creature.mood}) ${creature.variantId}`, ...frame.lines].join("\n"),
          "info",
        );
        // Run as a live stream animation in TUI.
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    },
  });

  pi.registerCommand("sleep", {
    description: "Run one sleep consolidation cycle",
    handler: async (_args, ctx) => {
      const { sleep } = await import("./system/sleep.js");
      await withInternalWrite(() => sleep());
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
      const result = await withInternalWrite(() => recordFeedback("positive", args || undefined));
      ctx.ui.notify(`✅ ${result.message}`, "info");
    },
  });

  pi.registerCommand("bad", {
    description: "Record negative reinforcement",
    handler: async (args, ctx) => {
      const { recordFeedback } = await import("./system/feedback.js");
      const result = await withInternalWrite(() => recordFeedback("negative", args || undefined));
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
      approved: Type.Optional(Type.Boolean({ description: "Set true to confirm approved mutation." })),
    }),
    async execute(_toolCallId, params) {
      const { mutate } = await import("./organism/evolution.js");
      const result = await mutate(rootDir, params.filePath, params.content, Boolean(params.approved));
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
      const { getEvolvePolicy } = await import("./system/control-plane.js");
      const { summarizeTrust } = await import("./system/social-memory.js");
      const plan = planEvolution(params.goal);
      const risky = listRiskyEvolveActions(plan);
      const evolvePolicy = await getEvolvePolicy(rootDir);
      const trustSummary = await summarizeTrust(rootDir);
      const trustRequiresApproval = trustSummary.count > 0 && trustSummary.average < 45;
      const approvalsEnforced = Boolean(params.requireApproval) || evolvePolicy.enforceApprovals || trustRequiresApproval;
      if (!params.execute) {
        return {
          content: [{ type: "text", text: `🧬 Planned ${plan.actions.length} action(s).` }],
          details: { success: true, plan, results: [] as any[], error: "" },
        };
      }
      if (approvalsEnforced && risky.length > 0 && !params.approvePlan) {
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
        approvePlan: Boolean(params.approvePlan),
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
      disableStrategy: Type.Optional(Type.Boolean({ description: "Disable cross-session strategy backlog for this run" })),
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
        useStrategy: !Boolean(params.disableStrategy),
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

  pi.registerTool({
    name: "mutate_creature_appearance",
    label: "Mutate Creature Appearance",
    description: "Safely mutate visual creature genome (palette/body/eyes/accent) without code changes.",
    parameters: Type.Object({
      palette: Type.Optional(Type.String({ description: "forest|sunset|ocean|ember" })),
      body: Type.Optional(Type.String({ description: "round|square|spiky" })),
      eyes: Type.Optional(Type.String({ description: "dot|wide|star|caret" })),
      accent: Type.Optional(Type.String({ description: "stripe|spots|cheeks|none" })),
      randomize: Type.Optional(Type.Boolean({ description: "Randomize all appearance traits" })),
    }),
    async execute(_toolCallId, params) {
      const { mutateGenome } = await import("./system/creature-genome.js");
      const config = JSON.parse(await fs.readFile(path.join(rootDir, "brain", "config.json"), "utf-8"));
      const seed = `${config.name || "hatchling"}:${config.createdAt || rootDir}:${Date.now()}`;
      const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

      const patch = params.randomize
        ? {
            palette: pick(["forest", "sunset", "ocean", "ember"] as const),
            body: pick(["round", "square", "spiky"] as const),
            eyes: pick(["dot", "wide", "star", "caret"] as const),
            accent: pick(["stripe", "spots", "cheeks", "none"] as const),
          }
        : {
            ...(params.palette ? { palette: params.palette } : {}),
            ...(params.body ? { body: params.body } : {}),
            ...(params.eyes ? { eyes: params.eyes } : {}),
            ...(params.accent ? { accent: params.accent } : {}),
          };

      if (Object.keys(patch).length === 0) {
        return {
          content: [{ type: "text", text: "❌ No appearance mutation provided." }],
          details: { success: false, error: "no_patch", genome: {} },
        };
      }
      try {
        const next = await mutateGenome(rootDir, seed, patch as any);
        return {
          content: [{ type: "text", text: "✅ Creature appearance updated." }],
          details: { success: true, error: "", genome: next },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `❌ Appearance mutation failed: ${String(error.message || error)}` }],
          details: { success: false, error: String(error.message || error), genome: {} },
        };
      }
    },
  });
}
