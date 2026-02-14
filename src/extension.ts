import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { performSleep } from "./system/sleep.js";
import { mutate } from "./system/mutate.js";
import { amputate } from "./system/amputate.js";
import { getVitals } from "./system/vitals.js";
import { recordFeedback } from "./system/feedback.js";
import { toggleDebugMode } from "./system/debug.js";
import { checkHealth, enterSafeMode } from "./system/health.js";
import { assemblePrompt } from "./system/soul.js";
import { startPulseDaemon, stopPulseDaemon } from "./system/pulse_daemon.js";

export default function (pi: ExtensionAPI) {
  // Health check on session start
  pi.on("session_start", async (ctx) => {
    const health = await checkHealth(ctx.rootDir);
    
    if (!health.healthy) {
      enterSafeMode(ctx);
      pi.log("⚠️  SAFE MODE: Last session had errors. Mutations disabled.");
    }
    
    // Assemble the system prompt with layered DNA
    const systemPrompt = await assemblePrompt(ctx.rootDir);
    ctx.setSystemPrompt(systemPrompt);
    
    // Start the Ghost Pulse daemon
    await startPulseDaemon(ctx.rootDir);
    
    pi.log("🥚 Hatchling initialized. Type /help for commands.");
  });

  pi.on("session_end", async (ctx) => {
    await stopPulseDaemon(ctx.rootDir);
  });

  // Register commands
  pi.registerCommand("sleep", {
    description: "Perform deterministic sleep cycle: snapshot state, synthesize learnings, and commit evolution",
    execute: async (ctx, args) => {
      try {
        const result = await performSleep(ctx.rootDir);
        return { success: true, message: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  pi.registerCommand("mutate", {
    description: "Create a new skill/tool in limbs_staging. Usage: /mutate <name> <description>",
    execute: async (ctx, args) => {
      const [name, ...descParts] = args;
      const description = descParts.join(" ");
      
      if (!name || !description) {
        return { success: false, error: "Usage: /mutate <name> <description>" };
      }
      
      try {
        const result = await mutate(ctx.rootDir, name, description);
        return { success: true, message: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  pi.registerCommand("amputate", {
    description: "Rollback last mutation and adjust curiosity",
    execute: async (ctx, args) => {
      try {
        const result = await amputate(ctx.rootDir);
        return { success: true, message: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  pi.registerCommand("vitals", {
    description: "Show system health metrics and status",
    execute: async (ctx, args) => {
      try {
        const vitals = await getVitals(ctx.rootDir);
        return { success: true, data: vitals };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  pi.registerCommand("good", {
    description: "Mark recent behavior as positive (reinforcement learning)",
    execute: async (ctx, args) => {
      try {
        await recordFeedback(ctx.rootDir, "positive", args.join(" "));
        return { success: true, message: "Positive feedback recorded 👍" };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  pi.registerCommand("bad", {
    description: "Mark recent behavior as negative (reinforcement learning)",
    execute: async (ctx, args) => {
      try {
        await recordFeedback(ctx.rootDir, "negative", args.join(" "));
        return { success: true, message: "Negative feedback recorded 👎" };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  pi.registerCommand("debug", {
    description: "Toggle debug mode for detailed tracing",
    execute: async (ctx, args) => {
      try {
        const enabled = await toggleDebugMode(ctx.rootDir);
        return { 
          success: true, 
          message: `Debug mode ${enabled ? "enabled" : "disabled"} 🔍` 
        };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });
}
