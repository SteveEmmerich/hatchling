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

        // Prompt for instance name
        const instanceName = await clack.text({
          message: "What would you like to name this Hatchling instance?",
          placeholder: "my-assistant",
          defaultValue: "default",
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return "Instance name is required";
            }
            if (!/^[a-z0-9-]+$/.test(value)) {
              return "Instance name must contain only lowercase letters, numbers, and hyphens";
            }
            return undefined;
          },
        });

        if (clack.isCancel(instanceName)) {
          clack.outro("Cancelled");
          process.exit(0);
        }

        const name = instanceName as string;

        // Check if instance already exists
        if (await instanceManager.instanceExists(name)) {
          clack.log.step("Already initialized");
          const shouldReinit = await clack.confirm({
            message: `Hatchling instance "${name}" already exists. Re-initialize?`,
            initialValue: false,
          });

          if (clack.isCancel(shouldReinit) || !shouldReinit) {
            clack.outro("Cancelled");
            process.exit(0);
          }
        }

        // Provider selection
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

        // Run self-discovery (this creates the instance)
        const { runSelfDiscovery } = await import("./system/onboard");
        const { instanceDir } = await runSelfDiscovery({ provider: provider as string, model });

        // Register the instance with the manager
        await instanceManager.registerInstance(name, instanceDir);

        // Set as current instance
        await instanceManager.setCurrentInstance(name);

        clack.outro(
          `✨ Initialization complete! Your Hatchling is ready to hatch. Run 'hatchling start' to begin your journey.`
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
