import { defineCommand, runMain } from "citty";
import { spawn } from "child_process";
import { resolve } from "path";
import { instanceManager } from "./system/instanceManager";
import * as clack from "@clack/prompts";

const main = defineCommand({
  meta: {
    name: "hatchling",
    version: "0.1.0",
    description: "Hatchling - Your AI Coding Companion",
  },
  subCommands: {
    init: defineCommand({
      meta: {
        description: "Initialize a new Hatchling instance",
      },
      async run() {
        clack.intro("🥚 Hatchling Initialization");

        // 1. Provider selection
        const provider = await clack.select({
          message: "Select AI provider:",
          options: [
            { value: "ollama", label: "Ollama (Local)" },
            { value: "openai", label: "OpenAI" },
            { value: "anthropic", label: "Anthropic" },
          ],
        });

        if (clack.isCancel(provider)) {
          clack.outro("Cancelled");
          process.exit(0);
        }

        // Model selection based on provider
        let model: string;
        if (provider === "ollama") {
          // Fetch available Ollama models
          try {
            const { execSync } = await import("child_process");
            const ollamaList = execSync("ollama list", { encoding: "utf-8" });
            const models = ollamaList
              .split("\n")
              .slice(1) // Skip header
              .map((line) => line.split(/\s+/)[0])
              .filter((name) => name && name !== "NAME");
            
            if (models.length === 0) {
              clack.log.error("No Ollama models found. Please install a model first with: ollama pull <model>");
              process.exit(1);
            }
            
            model = await clack.select({
              message: "Select model:",
              options: models.map((m) => ({ value: m, label: m })),
            }) as string;
          } catch (error) {
            clack.log.error("Failed to fetch Ollama models. Is Ollama running?");
            process.exit(1);
          }
        } else if (provider === "openai") {
          model = "gpt-4o";
        } else {
          model = "claude-3-5-sonnet-20241022";
        }

        if (clack.isCancel(model)) {
          clack.outro("Cancelled");
          process.exit(0);
        }

        // 4. Run self-discovery (AI determines agent personality AND name)
        const { runSelfDiscovery } = await import("./system/onboard");
        const { instanceDir, name: discoveredName } = await runSelfDiscovery({ 
          provider: provider as string, 
          model 
        });

        // Register and activate the discovered instance
        await instanceManager.registerInstance(discoveredName, instanceDir);
        await instanceManager.setCurrentInstance(discoveredName);

        clack.outro(
          `✨ Initialization complete! ${discoveredName} is ready to hatch. Run 'hatchling start' to begin your journey.`
        );
      },
    }),
    start: defineCommand({
      meta: {
        description: "Start a Hatchling instance",
      },
      async run() {
        const instancePath = await instanceManager.getCurrentInstance();
        
        if (!instancePath) {
          clack.log.error("No active Hatchling instance found.");
          clack.log.info("Run 'hatchling init' to create one, or 'hatchling use <name>' to activate an instance.");
          process.exit(1);
        }

        // Set environment variable for the instance
        process.env.HATCHLING_INSTANCE_PATH = instancePath;

        const extensionPath = resolve(__dirname, "extension.ts");
        const child = spawn("pi", ["--extension", extensionPath], {
          stdio: "inherit",
          shell: true,
          env: process.env,
        });

        child.on("error", (error) => {
          console.error("Failed to start pi:", error);
          process.exit(1);
        });

        child.on("exit", (code) => {
          process.exit(code || 0);
        });
      },
    }),
    list: defineCommand({
      meta: {
        description: "List all Hatchling instances",
      },
      async run() {
        const instances = await instanceManager.listInstances();
        
        if (instances.length === 0) {
          clack.log.info("No Hatchling instances found. Run 'hatchling init' to create one.");
          return;
        }

        clack.log.info("Available Hatchling instances:");
        for (const instance of instances) {
          console.log(`  • ${instance.name} (${instance.config.provider}:${instance.config.model})`);
        }
      },
    }),
    use: defineCommand({
      meta: {
        description: "Set the active Hatchling instance for the current directory",
      },
      args: {
        name: {
          type: "positional",
          description: "Instance name",
          required: true,
        },
      },
      async run({ args }) {
        const name = args.name as string;
        
        if (!(await instanceManager.instanceExists(name))) {
          clack.log.error(`Instance '${name}' not found.`);
          process.exit(1);
        }

        await instanceManager.setCurrentInstance(name);
        clack.log.success(`✓ Activated Hatchling instance: ${name}`);
      },
    }),
  },
});

runMain(main);
