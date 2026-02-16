import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Use instance path from environment, fallback to cwd
  const rootDir = process.env.HATCHLING_INSTANCE_PATH || process.cwd();
  
  // Health check on session start
  pi.on("session_start", async (ctx) => {
    const { checkHealth, enterSafeMode } = await import("./system/health.js");
    const { assemblePrompt } = await import("./system/soul.js");
    const { runPulse } = await import("./system/pulse_daemon.js");
    const { PathGuard } = await import("./system/pathGuard.js");
    
    // Initialize PathGuard with instance root
    PathGuard.setRoot(rootDir);
    
    // Load config to set model
    try {
      const configPath = await PathGuard.validatePath('brain/config.json', 'read');
      const config = await Bun.file(configPath).json();
      
      if (config.provider === 'ollama' && config.model) {
        // Configure pi to use Ollama
        ctx.setModel({
          id: config.model,
          provider: 'ollama',
          baseURL: 'http://127.0.0.1:11434'
        });
        console.log(`🤖 Using Ollama model: ${config.model}`);
      }
    } catch (error) {
      console.warn("Failed to load model config, using default:", (error as Error).message);
    }
    
    const health = await checkHealth();
    
    if (health.safeMode) {
      console.warn("⚠️  SAFE MODE: Last session had errors. Mutations disabled.");
      console.warn(`Reason: ${health.reason || 'Unknown'}`);
    }
    
    // System prompt is injected via before_agent_start event (see below)
    
    // Note: Ghost Pulse would run as background daemon - not implemented yet
    
    console.log("🥚 Hatchling initialized. Type /help for commands.");
  });

  pi.on("session_end", async (ctx) => {
    // Cleanup if needed
    console.log("👋 Hatchling session ended.");
  });

  // Inject custom system prompt before each agent call
  pi.on("before_agent_start", async (ctx) => {
    const { assemblePrompt } = await import("./system/soul.js");
    
    try {
      const systemPrompt = await assemblePrompt(rootDir);
      return { systemPrompt };
    } catch (error) {
      console.error("Failed to load system prompt:", error);
      return {}; // Use default system prompt if loading fails
    }
  });

  // Register commands
  pi.registerCommand("sleep", {
    description: "Perform deterministic sleep cycle: snapshot state, synthesize learnings, and commit evolution",
    execute: async (ctx, args) => {
      try {
        const { sleep } = await import("./system/sleep.js");
        await sleep();
        return { success: true, message: "Sleep cycle completed" };
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
        const { MutationEngine } = await import("./system/mutate.js");
        const engine = new MutationEngine();
        await engine.createMutation(name, description);
        return { success: true, message: `Mutation '${name}' created in limbs_staging` };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  pi.registerCommand("amputate", {
    description: "Rollback last mutation and adjust curiosity",
    execute: async (ctx, args) => {
      try {
        const { amputate } = await import("./system/amputate.js");
        await amputate();
        return { success: true, message: "Rollback completed" };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  });

  pi.registerCommand("vitals", {
    description: "Show system health metrics and status",
    execute: async (ctx, args) => {
      try {
        const { getVitals } = await import("./system/vitals.js");
        const vitals = await getVitals();
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
        const { recordFeedback } = await import("./system/feedback.js");
        await recordFeedback("positive", args.join(" "));
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
        const { recordFeedback } = await import("./system/feedback.js");
        await recordFeedback("negative", args.join(" "));
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
        const { Debugger } = await import("./system/debug.js");
        const debug = new Debugger();
        // Note: Debugger needs a toggle method implementation
        return { success: true, message: `Debug mode status: ${debug.isDebugMode() ? 'ON' : 'OFF'}` };
        const currentState = await Debugger.isDebug();
        const enabled = await Debugger.toggle(!currentState);
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
