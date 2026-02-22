/**
 * FILEPATH: src/cli.ts
 * The Life Sensor - Detects active instances and spawns pi processes in their territory
 */
import { defineCommand, runMain } from "citty";
import { spawn } from "child_process";
import { resolve } from "path";
import { existsSync } from "fs";
import { access, constants } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import * as clack from "@clack/prompts";
import {
  getActiveInstance,
  setActiveInstance,
  listInstances,
  deleteInstance,
  getInstancePath,
} from "./system/instance.js";
import { germinate, isHindbrainAvailable } from "./brain/hindbrain.js";

process.env.HATCHLING_INTERNAL_WRITE ||= "1";

type DoctorLevel = "pass" | "warn" | "fail";
interface DoctorCheck {
  key: string;
  level: DoctorLevel;
  message: string;
}

async function runDoctorChecks(): Promise<{ checks: DoctorCheck[]; ok: boolean }> {
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number(process.versions.node.split(".")[0] || "0");
  checks.push(
    nodeMajor >= 20
      ? { key: "node_version", level: "pass", message: `Node ${process.versions.node}` }
      : { key: "node_version", level: "fail", message: `Node ${process.versions.node} is unsupported (need >=20)` },
  );

  const hatchlingHome = process.env.HATCHLING_HOME || homedir();
  try {
    await access(hatchlingHome, constants.W_OK);
    checks.push({ key: "home_write", level: "pass", message: `Writable home: ${hatchlingHome}` });
  } catch {
    checks.push({
      key: "home_write",
      level: "warn",
      message: `Home is not writable: ${hatchlingHome}. Set HATCHLING_HOME to a writable directory.`,
    });
  }

  checks.push(
    isHindbrainAvailable()
      ? { key: "hindbrain_model", level: "pass", message: "Hindbrain model present on disk" }
      : { key: "hindbrain_model", level: "warn", message: "Hindbrain model missing (will be downloaded on init)" },
  );

  const backend = (process.env.HATCHLING_HINDBRAIN_BACKEND || "auto").toLowerCase();
  checks.push(
    ["auto", "cpu", "metal"].includes(backend)
      ? { key: "hindbrain_backend", level: "pass", message: `Hindbrain backend: ${backend}` }
      : { key: "hindbrain_backend", level: "warn", message: `Unknown backend '${backend}', use auto|cpu|metal` },
  );

  const activeInstance = await getActiveInstance();
  if (!activeInstance) {
    checks.push({
      key: "active_instance",
      level: "warn",
      message: `No active instance set (${join(hatchlingHome, ".hatchling_active")})`,
    });
  } else {
    const instancePath = getInstancePath(activeInstance);
    if (!existsSync(instancePath)) {
      checks.push({
        key: "active_instance_path",
        level: "fail",
        message: `Active instance path missing: ${instancePath}`,
      });
    } else {
      checks.push({
        key: "active_instance_path",
        level: "pass",
        message: `Active instance path exists: ${instancePath}`,
      });
      const required = [
        "src/extension.ts",
        "brain/config.json",
        "brain/CONSTITUTION.md",
        "brain/SOUL.md",
      ];
      for (const rel of required) {
        const full = join(instancePath, rel);
        checks.push(
          existsSync(full)
            ? { key: `instance_file:${rel}`, level: "pass", message: rel }
            : { key: `instance_file:${rel}`, level: "fail", message: `Missing ${rel}` },
        );
      }
    }
  }

  return {
    checks,
    ok: !checks.some((c) => c.level === "fail"),
  };
}

const main = defineCommand({
  meta: {
    name: "hatchling",
    version: "1.0.0",
    description: "Hatchling - The Self-Evolving AI Organism",
  },
  subCommands: {
    init: defineCommand({
      meta: {
        description: "Create a new Hatchling instance",
      },
      args: {
        nonInteractive: {
          type: "boolean",
          description: "Run init without prompts using provided identity flags",
          default: false,
        },
        provider: {
          type: "string",
          description: "Provider to use in non-interactive mode",
          default: "hindbrain",
        },
        model: {
          type: "string",
          description: "Model id to use in non-interactive mode",
          default: "hindbrain-1b",
        },
        name: {
          type: "string",
          description: "Agent name in non-interactive mode",
        },
        purpose: {
          type: "string",
          description: "Agent purpose in non-interactive mode",
        },
        personality: {
          type: "string",
          description: "Comma-separated personality traits in non-interactive mode",
        },
      },
      async run({ args }) {
        clack.intro("🥚 Hatchling Initialization");
        const nonInteractive = Boolean(
          (args as Record<string, unknown>).nonInteractive ||
          (args as Record<string, unknown>)["non-interactive"],
        );

        // 0. Germination - Ensure Hindbrain is available
        if (!isHindbrainAvailable() && !nonInteractive) {
          const spinner = clack.spinner();
          spinner.start("Germinating Hindbrain (downloading internal model)...");
          try {
            await germinate();
            spinner.stop("✓ Hindbrain ready");
          } catch (error) {
            spinner.stop("✗ Germination failed");
            clack.log.error(`Failed to initialize Hindbrain: ${error}`);
            // Continue anyway - external providers may still work
          }
        }

        // 1. Select AI provider
        const provider = nonInteractive
          ? (args.provider as string)
          : await clack.select({
              message: "Select AI provider:",
              options: [
                { value: "hindbrain", label: "Local (Hindbrain - Built-in)" },
                { value: "ollama", label: "Ollama (Local Models)" },
                { value: "anthropic", label: "Anthropic (Claude)" },
                { value: "openai", label: "OpenAI (GPT)" },
              ],
            });

        if (clack.isCancel(provider)) {
          clack.cancel("Initialization cancelled");
          process.exit(0);
        }

        // 2. Select model based on provider
        let model: string;
        if (nonInteractive) {
          model = (args.model as string) || "hindbrain-1b";
        } else if (provider === "hindbrain") {
          // Hindbrain uses internal model - no selection needed
          model = "hindbrain-1b";
          clack.log.info("Using built-in Hindbrain model (Llama-3.2-1B)");
        } else if (provider === "ollama") {
          const ollamaDiscovery = await import("./system/ollama-discovery.js");
          const models = await ollamaDiscovery.getAvailableModels();

          if (models.length === 0) {
            clack.log.error(
              "No Ollama models found. Please run 'ollama pull <model>' first."
            );
            process.exit(1);
          }

          model = (await clack.select({
            message: "Select model:",
            options: models.map((m: any) => ({
              value: m.name,
              label: `${m.name} (${(m.size / 1e9).toFixed(1)}GB)`,
            })),
          })) as string;
        } else {
          model = (await clack.text({
            message: "Enter model name:",
            placeholder:
              provider === "anthropic"
                ? "claude-3-5-sonnet-20241022"
                : "gpt-4o",
          })) as string;
        }

        if (clack.isCancel(model)) {
          clack.cancel("Initialization cancelled");
          process.exit(0);
        }

        // 3. Run self-discovery to determine instance name and identity
        const { runSelfDiscovery } = await import("./system/onboard.js");
        const seedIdentity = nonInteractive
          ? {
              name: String(args.name || "hatchling"),
              purpose: String(args.purpose || "To learn, grow, and evolve"),
              personality: String(args.personality || "curious,loyal")
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            }
          : undefined;
        const instanceDir = await runSelfDiscovery({
          provider: provider as string,
          model,
          seedIdentity,
        });

        clack.outro(
          "✨ Initialization complete! Your Hatchling is ready to hatch."
        );
        clack.log.info(`Run 'hatchling start' to begin your journey.`);
      },
    }),

    start: defineCommand({
      meta: {
        description: "Start the active Hatchling instance",
      },
      args: {
        smoke: {
          type: "boolean",
          description: "Validate start prerequisites without launching pi",
          default: false,
        },
      },
      async run({ args }) {
        clack.intro("🐣 Starting Hatchling");

        // Detect active instance
        const activeInstance = await getActiveInstance();

        if (!activeInstance) {
          clack.log.error("No active Hatchling instance found.");
          clack.log.info(
            "Run 'hatchling init' to create one, or 'hatchling use <name>' to activate an instance."
          );
          process.exit(1);
        }

        const instancePath = getInstancePath(activeInstance);
        const extensionPath = resolve(instancePath, "src/extension.ts");

        clack.log.step(`Starting instance: ${activeInstance}`);
        clack.log.info(`Instance path: ${instancePath}`);

        if (!existsSync(instancePath)) {
          clack.log.error(`Instance path does not exist: ${instancePath}`);
          process.exit(1);
        }
        if (!existsSync(extensionPath)) {
          clack.log.error(`Instance extension not found: ${extensionPath}`);
          process.exit(1);
        }

        if (args.smoke) {
          clack.log.success("Smoke check passed: start prerequisites are valid.");
          return;
        }

        const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

        // Spawn pi with cwd set to the instance directory.
        const pi = spawn(npxCommand, ["pi", "--extension", extensionPath], {
          stdio: "inherit",
          shell: false,
          cwd: instancePath, // THIS IS KEY: Run in the instance's territory
          env: {
            ...process.env,
            HATCHLING_INSTANCE_PATH: instancePath,
          },
        });

        pi.on("error", (error) => {
          clack.log.error(`Failed to launch pi: ${error.message}`);
          process.exit(1);
        });

        pi.on("exit", (code) => {
          if (code !== 0) {
            clack.log.error("Instance exited with an error.");
          }
          process.exit(code || 0);
        });
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

        try {
          await setActiveInstance(name);
          clack.log.success(`Active instance set to: ${name}`);
        } catch (error) {
          clack.log.error((error as Error).message);
          process.exit(1);
        }
      },
    }),

    list: defineCommand({
      meta: {
        description: "List all Hatchling instances",
      },
      async run() {
        const instances = await listInstances();

        if (instances.length === 0) {
          clack.log.info("No Hatchling instances found. Run 'hatchling init' to create one.");
          return;
        }

        const activeInstance = await getActiveInstance();

        clack.intro("🐣 Hatchling Instances");
        for (const instance of instances) {
          const isActive = instance.name === activeInstance;
          clack.log.message(
            `${isActive ? "●" : "○"} ${instance.name} (${instance.provider}/${instance.model})`
          );
          clack.log.message(`  Created: ${new Date(instance.createdAt).toLocaleDateString()}`);
          clack.log.message(`  Last active: ${new Date(instance.lastActive).toLocaleDateString()}`);
        }
        clack.outro("");
      },
    }),

    delete: defineCommand({
      meta: {
        description: "Delete a Hatchling instance",
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

        const confirm = await clack.confirm({
          message: `Delete instance '${name}'? This cannot be undone.`,
        });

        if (clack.isCancel(confirm) || !confirm) {
          clack.cancel("Deletion cancelled");
          return;
        }

        try {
          await deleteInstance(name);
          clack.log.success(`Instance '${name}' deleted.`);
        } catch (error) {
          clack.log.error((error as Error).message);
          process.exit(1);
        }
      },
    }),

    skill: defineCommand({
      meta: {
        description: "Manage evolving skills (stage, list, promote)",
      },
      subCommands: {
        stage: defineCommand({
          meta: { description: "Stage a new skill in limbs_staging" },
          args: {
            name: {
              type: "positional",
              description: "Skill name",
              required: true,
            },
            description: {
              type: "positional",
              description: "Skill description",
              required: true,
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { stageSkill } = await import("./system/skills.js");
            try {
              const staged = await stageSkill(
                rootDir,
                String(args.name),
                String(args.description),
              );
              clack.log.success(`Staged skill '${staged.name}' in limbs_staging.`);
            } catch (error) {
              clack.log.error((error as Error).message);
              process.exit(1);
            }
          },
        }),
        list: defineCommand({
          meta: { description: "List active and staged skills for active instance" },
          async run() {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { listSkills } = await import("./system/skills.js");
            const skills = await listSkills(rootDir);
            clack.intro("🦾 Skill Registry");
            clack.log.message(`Active: ${skills.active.length ? skills.active.join(", ") : "(none)"}`);
            clack.log.message(`Staged: ${skills.staged.length ? skills.staged.join(", ") : "(none)"}`);
            clack.outro("");
          },
        }),
        promote: defineCommand({
          meta: { description: "Promote a staged skill into active limbs" },
          args: {
            name: {
              type: "positional",
              description: "Skill name",
              required: true,
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { promoteSkill } = await import("./system/skills.js");
            try {
              const promotedPath = await promoteSkill(rootDir, String(args.name));
              clack.log.success(`Promoted skill '${String(args.name)}' -> ${promotedPath}`);
            } catch (error) {
              clack.log.error((error as Error).message);
              process.exit(1);
            }
          },
        }),
      },
    }),

    web: defineCommand({
      meta: {
        description: "Run local web dashboard for the active instance",
      },
      args: {
        port: {
          type: "string",
          description: "Port to bind (default: 8787)",
          default: "8787",
        },
        snapshot: {
          type: "boolean",
          description: "Print dashboard HTML snapshot and exit",
          default: false,
        },
      },
      async run({ args }) {
        const activeInstance = await getActiveInstance();
        if (!activeInstance) {
          clack.log.error("No active instance found. Run 'hatchling init' first.");
          process.exit(1);
        }
        const rootDir = getInstancePath(activeInstance);
        const { renderWebDashboard, startWebDashboard } = await import("./system/web.js");

        if (args.snapshot) {
          const html = await renderWebDashboard(rootDir);
          console.log(html);
          return;
        }

        const port = Number(args.port || "8787");
        if (!Number.isFinite(port) || port <= 0 || port > 65535) {
          clack.log.error(`Invalid port: ${String(args.port)}`);
          process.exit(1);
        }
        const server = await startWebDashboard(rootDir, port);
        clack.intro("🌐 Hatchling Web Dashboard");
        clack.log.info(`Dashboard running at http://127.0.0.1:${port}`);
        clack.log.info("Press Ctrl+C to stop.");

        process.on("SIGINT", () => {
          server.close(() => process.exit(0));
        });
      },
    }),

    doctor: defineCommand({
      meta: {
        description: "Run environment and runtime health checks",
      },
      args: {
        json: {
          type: "boolean",
          description: "Print machine-readable JSON report",
          default: false,
        },
      },
      async run({ args }) {
        const report = await runDoctorChecks();
        if (args.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          clack.intro("🩺 Hatchling Doctor");
          for (const check of report.checks) {
            const prefix =
              check.level === "pass" ? "✅" : check.level === "warn" ? "⚠️" : "❌";
            clack.log.message(`${prefix} ${check.key}: ${check.message}`);
          }
          clack.outro(report.ok ? "Doctor checks passed." : "Doctor found blocking issues.");
        }
        if (!report.ok) {
          process.exit(1);
        }
      },
    }),
  },
});

runMain(main);
