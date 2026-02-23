/**
 * FILEPATH: src/cli.ts
 * The Life Sensor - Detects active instances and spawns pi processes in their territory
 */
import { defineCommand, runMain } from "citty";
import { spawn } from "child_process";
import { resolve } from "path";
import { existsSync, openSync } from "fs";
import { access, constants, mkdir, readFile, rm, writeFile } from "fs/promises";
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

interface DaemonState {
  pid: number;
  startedAt: string;
  instance: string;
  logPath: string;
}

function daemonStatePath(instancePath: string): string {
  return join(instancePath, "brain", "daemon_state.json");
}

function daemonLogPath(instancePath: string): string {
  return join(instancePath, "memory", "daemon.log");
}

async function readDaemonState(instancePath: string): Promise<DaemonState | null> {
  try {
    const parsed = JSON.parse(await readFile(daemonStatePath(instancePath), "utf-8")) as DaemonState;
    if (!parsed || typeof parsed.pid !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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

      try {
        const { loadCapabilities } = await import("./system/capabilities.js");
        const registry = await loadCapabilities(instancePath);
        const channelDefs = [
          { name: "telegram", capability: "channel.telegram", defaults: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] },
          { name: "whatsapp", capability: "channel.whatsapp", defaults: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] },
        ] as const;

        for (const channel of channelDefs) {
          const state = registry.capabilities[channel.capability];
          if (!state?.enabled) continue;

          const skillPath = join(instancePath, "limbs", `${channel.name}-gateway`, "SKILL.md");
          checks.push(
            existsSync(skillPath)
              ? {
                  key: `channel_${channel.name}_gateway`,
                  level: "pass",
                  message: `${channel.name} gateway limb present`,
                }
              : {
                  key: `channel_${channel.name}_gateway`,
                  level: "fail",
                  message: `${channel.name} capability enabled but gateway limb missing`,
                },
          );

          const envNames =
            channel.name === "telegram"
              ? [
                  String(state.metadata?.botTokenEnvVar || channel.defaults[0]),
                  String(state.metadata?.chatIdEnvVar || channel.defaults[1]),
                ]
              : [
                  String(state.metadata?.accessTokenEnvVar || channel.defaults[0]),
                  String(state.metadata?.phoneNumberIdEnvVar || channel.defaults[1]),
                ];
          const missing = envNames.filter((envName) => !process.env[envName]);
          checks.push(
            missing.length === 0
              ? {
                  key: `channel_${channel.name}_env`,
                  level: "pass",
                  message: `${channel.name} env ready (${envNames.join(", ")})`,
                }
              : {
                  key: `channel_${channel.name}_env`,
                  level: "warn",
                  message: `${channel.name} env missing (${missing.join(", ")})`,
                },
          );
        }
      } catch (error: any) {
        checks.push({
          key: "capabilities_read",
          level: "warn",
          message: `Unable to read capabilities: ${String(error?.message || error)}`,
        });
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
        daemon: {
          type: "boolean",
          description: "Run Hatchling in background daemon mode",
          default: false,
        },
        stopDaemon: {
          type: "boolean",
          description: "Stop background daemon for the active instance",
          default: false,
        },
        daemonStatus: {
          type: "boolean",
          description: "Print daemon status for the active instance",
          default: false,
        },
        daemonCommand: {
          type: "string",
          description: "Override daemon command binary (advanced/testing)",
        },
        daemonArgs: {
          type: "string",
          description: "Space-separated daemon command args (advanced/testing)",
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

        if (args.stopDaemon) {
          const state = await readDaemonState(instancePath);
          if (!state) {
            clack.log.info("No daemon state file found.");
            return;
          }
          if (!isProcessRunning(state.pid)) {
            clack.log.warn(`Daemon PID ${state.pid} is not running; cleaning stale state.`);
            await rm(daemonStatePath(instancePath), { force: true });
            return;
          }
          try {
            process.kill(state.pid, "SIGTERM");
          } catch (error: any) {
            clack.log.error(`Failed to stop daemon: ${String(error.message || error)}`);
            process.exit(1);
          }
          await rm(daemonStatePath(instancePath), { force: true });
          clack.log.success(`Stopped daemon PID ${state.pid} for ${activeInstance}.`);
          return;
        }

        if (args.daemonStatus) {
          const state = await readDaemonState(instancePath);
          if (!state) {
            clack.log.info("Daemon is not running.");
            return;
          }
          const running = isProcessRunning(state.pid);
          if (!running) {
            clack.log.warn(`Daemon state found but PID ${state.pid} is not running.`);
            return;
          }
          clack.log.success(`Daemon running (pid=${state.pid}) for ${activeInstance}.`);
          clack.log.info(`Log: ${state.logPath}`);
          return;
        }

        if (args.smoke) {
          clack.log.success("Smoke check passed: start prerequisites are valid.");
          return;
        }

        const defaultCommand = process.platform === "win32" ? "npx.cmd" : "npx";
        const command = args.daemonCommand ? String(args.daemonCommand) : defaultCommand;
        const commandArgs = args.daemonCommand
          ? (args.daemonArgs ? String(args.daemonArgs).split(/\s+/).filter(Boolean) : [])
          : ["pi", "--extension", extensionPath];

        if (args.daemon) {
          const existing = await readDaemonState(instancePath);
          if (existing && isProcessRunning(existing.pid)) {
            clack.log.warn(`Daemon already running (pid=${existing.pid}).`);
            clack.log.info(`Log: ${existing.logPath}`);
            return;
          }

          const logPath = daemonLogPath(instancePath);
          await mkdir(join(instancePath, "memory"), { recursive: true });
          const logFd = openSync(logPath, "a");
          const daemon = spawn(command, commandArgs, {
            stdio: ["ignore", logFd, logFd],
            shell: false,
            detached: true,
            cwd: instancePath,
            env: {
              ...process.env,
              HATCHLING_INSTANCE_PATH: instancePath,
            },
          });
          daemon.unref();
          const state: DaemonState = {
            pid: daemon.pid ?? -1,
            startedAt: new Date().toISOString(),
            instance: activeInstance,
            logPath,
          };
          await writeFile(daemonStatePath(instancePath), JSON.stringify(state, null, 2), "utf-8");
          clack.log.success(`Daemon started for ${activeInstance} (pid=${state.pid}).`);
          clack.log.info(`Log: ${logPath}`);
          return;
        }

        // Spawn pi with cwd set to the instance directory.
        const pi = spawn(command, commandArgs, {
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
        install: defineCommand({
          meta: { description: "Install a skill from local directory or repository into active limbs" },
          args: {
            source: {
              type: "positional",
              description: "Local path or git repository URL",
              required: true,
            },
            name: {
              type: "string",
              description: "Optional installed skill name override",
            },
            subdir: {
              type: "string",
              description: "Optional skill subdirectory within source/repo",
            },
            approveUntrusted: {
              type: "boolean",
              description: "Approve install from untrusted repo host",
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
            const { installSkillFromSource } = await import("./system/skills.js");
            try {
              const installed = await installSkillFromSource(
                rootDir,
                String(args.source),
                args.name ? String(args.name) : undefined,
                args.subdir ? String(args.subdir) : undefined,
                { approveUntrusted: Boolean(args.approveUntrusted) },
              );
              clack.log.success(`Installed skill -> ${installed}`);
            } catch (error) {
              clack.log.error((error as Error).message);
              process.exit(1);
            }
          },
        }),
      },
    }),

    mcp: defineCommand({
      meta: {
        description: "Manage MCP servers for the active instance",
      },
      subCommands: {
        add: defineCommand({
          meta: { description: "Add an MCP server definition" },
          args: {
            name: {
              type: "positional",
              required: true,
              description: "Server name",
            },
            command: {
              type: "positional",
              required: true,
              description: "Executable command",
            },
            args: {
              type: "positional",
              required: false,
              description: "Optional command args",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { addMCPServer } = await import("./system/mcp.js");
            try {
              const allPositionals = Array.isArray(args._) ? args._.map((v) => String(v)) : [];
              const extra = allPositionals.slice(2);
              const added = await addMCPServer(rootDir, String(args.name), String(args.command), extra);
              clack.log.success(`Added MCP server '${added.name}' -> ${added.command} ${added.args.join(" ")}`.trim());
            } catch (error) {
              clack.log.error((error as Error).message);
              process.exit(1);
            }
          },
        }),
        list: defineCommand({
          meta: { description: "List MCP servers for active instance" },
          args: {
            json: {
              type: "boolean",
              description: "Print JSON output",
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
            const { listMCPServers } = await import("./system/mcp.js");
            const servers = await listMCPServers(rootDir);
            if (args.json) {
              console.log(JSON.stringify(servers, null, 2));
              return;
            }
            clack.intro("🔌 MCP Servers");
            if (!servers.length) {
              clack.log.message("(none)");
            } else {
              for (const server of servers) {
                clack.log.message(`- ${server.name}: ${server.command} ${server.args.join(" ")}`.trim());
              }
            }
            clack.outro("");
          },
        }),
        remove: defineCommand({
          meta: { description: "Remove an MCP server by name" },
          args: {
            name: {
              type: "positional",
              required: true,
              description: "Server name",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { removeMCPServer } = await import("./system/mcp.js");
            const removed = await removeMCPServer(rootDir, String(args.name));
            if (!removed) {
              clack.log.error(`MCP server '${String(args.name)}' not found.`);
              process.exit(1);
            }
            clack.log.success(`Removed MCP server '${String(args.name)}'.`);
          },
        }),
        export: defineCommand({
          meta: { description: "Export MCP servers as Pi-compatible JSON object" },
          async run() {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { exportMCPServersForPi } = await import("./system/mcp.js");
            const exported = await exportMCPServersForPi(rootDir);
            console.log(JSON.stringify(exported, null, 2));
          },
        }),
      },
    }),

    config: defineCommand({
      meta: {
        description: "Manage editable control-plane configuration for active instance",
      },
      subCommands: {
        path: defineCommand({
          meta: { description: "Print control-plane file path" },
          async run() {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { controlPlanePath } = await import("./system/control-plane.js");
            console.log(controlPlanePath(rootDir));
          },
        }),
        init: defineCommand({
          meta: { description: "Generate control-plane.json from current state" },
          async run() {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { initControlPlane } = await import("./system/control-plane.js");
            const target = await initControlPlane(rootDir);
            clack.log.success(`Control-plane initialized: ${target}`);
          },
        }),
        show: defineCommand({
          meta: { description: "Show control-plane JSON" },
          args: {
            json: {
              type: "boolean",
              default: false,
              description: "Print compact JSON",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { readControlPlane } = await import("./system/control-plane.js");
            const control = await readControlPlane(rootDir);
            console.log(JSON.stringify(control, null, args.json ? 0 : 2));
          },
        }),
        validate: defineCommand({
          meta: { description: "Validate control-plane JSON schema" },
          async run() {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { readControlPlane, validateControlPlane } = await import("./system/control-plane.js");
            const control = await readControlPlane(rootDir);
            validateControlPlane(control);
            clack.log.success("Control-plane is valid.");
          },
        }),
        apply: defineCommand({
          meta: { description: "Apply control-plane.json to runtime state files" },
          args: {
            json: {
              type: "boolean",
              default: false,
              description: "Print machine-readable result",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { readControlPlane, applyControlPlane } = await import("./system/control-plane.js");
            try {
              const control = await readControlPlane(rootDir);
              await applyControlPlane(rootDir, control);
              if (args.json) {
                console.log(JSON.stringify({ ok: true }, null, 2));
              } else {
                clack.log.success("Control-plane applied successfully.");
              }
            } catch (error: any) {
              if (args.json) {
                console.log(JSON.stringify({ ok: false, error: String(error.message || error) }, null, 2));
              } else {
                clack.log.error(String(error.message || error));
              }
              process.exit(1);
            }
          },
        }),
      },
    }),

    channel: defineCommand({
      meta: {
        description: "Manage communication channel gateway capabilities",
      },
      subCommands: {
        list: defineCommand({
          meta: { description: "List channel capability states" },
          async run() {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { loadCapabilities } = await import("./system/capabilities.js");
            const caps = await loadCapabilities(rootDir);
            const telegram = caps.capabilities["channel.telegram"]?.enabled ? "enabled" : "disabled";
            const whatsapp = caps.capabilities["channel.whatsapp"]?.enabled ? "enabled" : "disabled";
            clack.intro("📡 Channel Gateways");
            clack.log.message(`- telegram: ${telegram}`);
            clack.log.message(`- whatsapp: ${whatsapp}`);
            clack.outro("");
          },
        }),
        bootstrap: defineCommand({
          meta: { description: "Bootstrap a channel gateway skill and capability" },
          args: {
            name: {
              type: "positional",
              required: true,
              description: "Channel name (telegram|whatsapp)",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { bootstrapChannelCapability } = await import("./system/channels.js");
            try {
              const result = await bootstrapChannelCapability(rootDir, String(args.name));
              clack.log.success(`Bootstrapped ${result.channel} gateway at ${result.skillPath}`);
            } catch (error: any) {
              clack.log.error(String(error.message || error));
              process.exit(1);
            }
          },
        }),
        validate: defineCommand({
          meta: { description: "Validate channel readiness (env + capability state)" },
          args: {
            name: {
              type: "positional",
              required: true,
              description: "Channel name (telegram|whatsapp)",
            },
            json: {
              type: "boolean",
              default: false,
              description: "Print machine-readable result",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { validateChannelCapability } = await import("./system/channels.js");
            const result = await validateChannelCapability(rootDir, String(args.name));
            if (args.json) {
              console.log(JSON.stringify(result, null, 2));
            } else if (result.ok) {
              clack.log.success(result.message);
            } else {
              clack.log.error(result.message);
            }
            if (!result.ok) process.exit(1);
          },
        }),
        "test-message": defineCommand({
          meta: { description: "Simulate sending a test message via channel gateway" },
          args: {
            name: {
              type: "positional",
              required: true,
              description: "Channel name (telegram|whatsapp)",
            },
            message: {
              type: "string",
              required: true,
              description: "Test message payload",
            },
            json: {
              type: "boolean",
              default: false,
              description: "Print machine-readable result",
            },
            live: {
              type: "boolean",
              default: false,
              description: "Send through real provider API instead of simulation",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { sendChannelTestMessage } = await import("./system/channels.js");
            try {
              const result = await sendChannelTestMessage(
                rootDir,
                String(args.name),
                String(args.message),
                { mode: args.live ? "live" : "simulate" },
              );
              if (args.json) {
                console.log(JSON.stringify(result, null, 2));
              } else {
                clack.log.success(
                  `${args.live ? "Live" : "Simulated"} test message queued in ${result.outboxPath}`,
                );
              }
            } catch (error: any) {
              if (args.json) {
                console.log(JSON.stringify({ ok: false, error: String(error.message || error) }, null, 2));
              } else {
                clack.log.error(String(error.message || error));
              }
              process.exit(1);
            }
          },
        }),
        run: defineCommand({
          meta: { description: "Run live channel runtime loop (separate from maintenance loop)" },
          args: {
            name: {
              type: "positional",
              required: true,
              description: "Channel name (telegram|whatsapp)",
            },
            watch: {
              type: "boolean",
              default: false,
              description: "Run continuously; otherwise run one tick",
            },
            interval: {
              type: "string",
              default: "15000",
              description: "Loop interval in milliseconds when --watch is set",
            },
            autoReply: {
              type: "boolean",
              default: false,
              description: "Auto-ack inbound messages when true",
            },
            json: {
              type: "boolean",
              default: false,
              description: "Print machine-readable result",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const channelName = String(args.name).trim().toLowerCase();
            if (channelName !== "telegram" && channelName !== "whatsapp") {
              clack.log.error("Unsupported channel. Use telegram or whatsapp.");
              process.exit(1);
            }
            const channel = channelName as "telegram" | "whatsapp";
            const { runChannelRuntimeTick, startChannelRuntimeLoop, stopChannelRuntimeLoop } = await import("./system/channel-runtime.js");

            if (!args.watch) {
              const report = await runChannelRuntimeTick(rootDir, channel, {
                autoReply: Boolean(args.autoReply),
              });
              if (args.json) {
                console.log(JSON.stringify(report, null, 2));
              } else if (report.ok) {
                clack.log.success(
                  `${channel} runtime tick complete: processed=${report.processed}`,
                );
              } else {
                clack.log.warn(`${channel} runtime blocked: ${report.blocked}`);
              }
              if (!report.ok) process.exit(1);
              return;
            }

            const interval = Number(args.interval || "15000");
            if (!Number.isFinite(interval) || interval < 1000) {
              clack.log.error(`Invalid interval: ${String(args.interval)} (must be >= 1000)`);
              process.exit(1);
            }
            await startChannelRuntimeLoop(rootDir, channel, interval, {
              autoReply: Boolean(args.autoReply),
            });
            clack.intro(`📨 ${channel} Channel Runtime`);
            clack.log.info(`Running every ${interval}ms for ${activeInstance}`);
            clack.log.info("Press Ctrl+C to stop.");
            process.on("SIGINT", () => {
              stopChannelRuntimeLoop(rootDir, channel);
              process.exit(0);
            });
          },
        }),
      },
    }),

    capability: defineCommand({
      meta: {
        description: "List and toggle optional capabilities for the active instance",
      },
      subCommands: {
        list: defineCommand({
          meta: { description: "List capability states" },
          args: {
            json: {
              type: "boolean",
              default: false,
              description: "Print machine-readable JSON",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { listCapabilities } = await import("./system/capabilities.js");
            const registry = await listCapabilities(rootDir);
            if (args.json) {
              console.log(JSON.stringify(registry, null, 2));
              return;
            }
            clack.intro("🧩 Capability Registry");
            Object.entries(registry.capabilities)
              .sort(([a], [b]) => a.localeCompare(b))
              .forEach(([name, state]) => {
                clack.log.message(`- ${name}: ${state.enabled ? "enabled" : "disabled"}`);
              });
            clack.outro("");
          },
        }),
        enable: defineCommand({
          meta: { description: "Enable a capability" },
          args: {
            name: {
              type: "positional",
              required: true,
              description: "Capability name",
            },
            provider: {
              type: "string",
              description: "Optional provider override (for chat capabilities)",
            },
            model: {
              type: "string",
              description: "Optional model override (for chat capabilities)",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const capabilityName = String(args.name).trim().toLowerCase();
            if (capabilityName === "channel.telegram" || capabilityName === "channel.whatsapp") {
              const { bootstrapChannelCapability } = await import("./system/channels.js");
              const channel = capabilityName.split(".")[1];
              const result = await bootstrapChannelCapability(rootDir, channel);
              clack.log.success(`Enabled ${capabilityName} via ${result.skillPath}.`);
              return;
            }

            const { enableCapability } = await import("./system/capabilities.js");
            const state = await enableCapability(rootDir, capabilityName, {
              provider: args.provider ? String(args.provider) : undefined,
              model: args.model ? String(args.model) : undefined,
            });
            clack.log.success(`Enabled ${capabilityName} (${state.enabled ? "enabled" : "disabled"}).`);
          },
        }),
        disable: defineCommand({
          meta: { description: "Disable a capability" },
          args: {
            name: {
              type: "positional",
              required: true,
              description: "Capability name",
            },
          },
          async run({ args }) {
            const activeInstance = await getActiveInstance();
            if (!activeInstance) {
              clack.log.error("No active instance found. Run 'hatchling init' first.");
              process.exit(1);
            }
            const rootDir = getInstancePath(activeInstance);
            const { disableCapability } = await import("./system/capabilities.js");
            const state = await disableCapability(rootDir, String(args.name));
            clack.log.success(`Disabled ${String(args.name)} (${state.enabled ? "enabled" : "disabled"}).`);
          },
        }),
      },
    }),

    evolve: defineCommand({
      meta: {
        description: "Plan or execute evolution steps from a natural-language goal",
      },
      args: {
        goal: {
          type: "positional",
          required: true,
          description: "Natural-language evolution goal",
        },
        execute: {
          type: "boolean",
          default: false,
          description: "Execute planned actions (default is dry-run plan)",
        },
        json: {
          type: "boolean",
          default: false,
          description: "Print machine-readable output",
        },
        approveUntrusted: {
          type: "boolean",
          default: false,
          description: "Approve untrusted repository sources for install actions",
        },
        skillSubdir: {
          type: "string",
          description: "Optional skill subdirectory to use for install actions",
        },
        enforceApprovals: {
          type: "boolean",
          default: false,
          description: "Require explicit approval before executing risky actions",
        },
        approvePlan: {
          type: "boolean",
          default: false,
          description: "Approve execution of risky actions when approvals are enforced",
        },
      },
      async run({ args }) {
        const activeInstance = await getActiveInstance();
        if (!activeInstance) {
          clack.log.error("No active instance found. Run 'hatchling init' first.");
          process.exit(1);
        }
        const rootDir = getInstancePath(activeInstance);
        const { planEvolution, executeEvolutionPlan, listRiskyEvolveActions } = await import("./system/evolve.js");
        const { getEvolvePolicy } = await import("./system/control-plane.js");

        const plan = planEvolution(String(args.goal));
        const riskyActions = listRiskyEvolveActions(plan);
        const evolvePolicy = await getEvolvePolicy(rootDir);
        const approvalsEnforced = Boolean(args.enforceApprovals) || evolvePolicy.enforceApprovals;
        const approvedByFlag = Boolean(args.approvePlan);
        if (args.json) {
          if (!args.execute) {
            console.log(JSON.stringify({ mode: "plan", plan }, null, 2));
            return;
          }
          if (approvalsEnforced && riskyActions.length > 0 && !approvedByFlag) {
            console.log(
              JSON.stringify(
                {
                  mode: "execute",
                  plan,
                  error: "Approvals required for risky actions. Re-run with --approvePlan.",
                  riskyActions: riskyActions.map((action) => action.type),
                },
                null,
                2,
              ),
            );
            process.exit(1);
          }
          const results = await executeEvolutionPlan(rootDir, plan, {
            approveUntrusted: Boolean(args.approveUntrusted),
            skillSubdir: args.skillSubdir ? String(args.skillSubdir) : undefined,
          });
          console.log(JSON.stringify({ mode: "execute", plan, results }, null, 2));
          if (results.some((result) => !result.success)) {
            process.exit(1);
          }
          return;
        }

        clack.intro("🧬 Evolution Planner");
        if (!plan.actions.length) {
          clack.log.warn("No actionable evolution steps were inferred from this goal.");
          clack.outro("");
          return;
        }
        plan.actions.forEach((action, index) => {
          clack.log.message(`${index + 1}. ${action.type} — ${action.reason}`);
        });
        if (!args.execute) {
          clack.log.info("Dry-run complete. Re-run with --execute to apply.");
          clack.outro("");
          return;
        }

        if (approvalsEnforced && riskyActions.length > 0 && !approvedByFlag) {
          clack.log.warn(
            `Risky actions pending approval: ${riskyActions.map((action) => action.type).join(", ")}`,
          );
          const confirm = await clack.confirm({
            message: "Approve and execute risky evolution actions?",
            initialValue: false,
          });
          if (clack.isCancel(confirm) || !confirm) {
            clack.cancel("Execution cancelled: approval not granted.");
            process.exit(1);
          }
        }

        const results = await executeEvolutionPlan(rootDir, plan, {
          approveUntrusted: Boolean(args.approveUntrusted),
          skillSubdir: args.skillSubdir ? String(args.skillSubdir) : undefined,
        });
        for (const result of results) {
          if (result.success) {
            clack.log.success(`${result.type}: ${result.message}`);
          } else {
            clack.log.error(`${result.type}: ${result.message}`);
          }
        }
        clack.outro("");
        if (results.some((result) => !result.success)) {
          process.exit(1);
        }
      },
    }),

    autonomy: defineCommand({
      meta: {
        description: "Run a bounded autonomous multi-step evolution loop",
      },
      args: {
        goal: {
          type: "positional",
          required: true,
          description: "High-level natural-language objective",
        },
        execute: {
          type: "boolean",
          default: false,
          description: "Execute planned steps (default is dry-run)",
        },
        maxSteps: {
          type: "string",
          default: "5",
          description: "Maximum number of planned objectives to process",
        },
        json: {
          type: "boolean",
          default: false,
          description: "Print machine-readable output",
        },
        enforceApprovals: {
          type: "boolean",
          default: false,
          description: "Require approval for risky actions in each step",
        },
        approvePlan: {
          type: "boolean",
          default: false,
          description: "Approve risky actions when approvals are enforced",
        },
        approveUntrusted: {
          type: "boolean",
          default: false,
          description: "Approve untrusted repository installs",
        },
        skillSubdir: {
          type: "string",
          description: "Optional skill subdirectory for install actions",
        },
        disableStrategy: {
          type: "boolean",
          default: false,
          description: "Disable cross-session strategy backlog for this run",
        },
      },
      async run({ args }) {
        const activeInstance = await getActiveInstance();
        if (!activeInstance) {
          clack.log.error("No active instance found. Run 'hatchling init' first.");
          process.exit(1);
        }
        const rootDir = getInstancePath(activeInstance);
        const { runAutonomousEvolution } = await import("./system/autonomy.js");
        const { getEvolvePolicy } = await import("./system/control-plane.js");

        const evolvePolicy = await getEvolvePolicy(rootDir);
        const approvalsEnforced = Boolean(args.enforceApprovals) || evolvePolicy.enforceApprovals;
        const maxSteps = Number(args.maxSteps || "5");
        const result = await runAutonomousEvolution(rootDir, String(args.goal), {
          execute: Boolean(args.execute),
          maxSteps: Number.isFinite(maxSteps) && maxSteps > 0 ? Math.floor(maxSteps) : 5,
          enforceApprovals: approvalsEnforced,
          approvePlan: Boolean(args.approvePlan),
          approveUntrusted: Boolean(args.approveUntrusted),
          skillSubdir: args.skillSubdir ? String(args.skillSubdir) : undefined,
          useStrategy: !Boolean(args.disableStrategy),
        });

        if (args.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          clack.intro("🧭 Autonomous Evolution");
          clack.log.message(`Run: ${result.runId}`);
          result.steps.forEach((step) => {
            clack.log.message(
              `${step.index}. [${step.status}] ${step.objective} (${step.plan.actions.length} action(s))`,
            );
          });
          if (result.stoppedReason) {
            clack.log.warn(`Stopped early: ${result.stoppedReason}`);
          }
          clack.outro(result.ok ? "Autonomy run complete." : "Autonomy run completed with blocking issues.");
        }

        if (!result.ok) {
          process.exit(1);
        }
      },
    }),

    rollback: defineCommand({
      meta: {
        description: "Rollback last (or selected) evolution run using journaled undo actions",
      },
      args: {
        runId: {
          type: "string",
          description: "Optional evolution run id to rollback",
        },
        json: {
          type: "boolean",
          default: false,
          description: "Print machine-readable result",
        },
      },
      async run({ args }) {
        const activeInstance = await getActiveInstance();
        if (!activeInstance) {
          clack.log.error("No active instance found. Run 'hatchling init' first.");
          process.exit(1);
        }
        const rootDir = getInstancePath(activeInstance);
        const { rollbackEvolution } = await import("./system/evolve.js");

        try {
          const result = await rollbackEvolution(
            rootDir,
            args.runId ? String(args.runId) : undefined,
          );
          if (args.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            result.results.forEach((entry) => {
              if (entry.success) {
                clack.log.success(`${entry.type}: ${entry.message}`);
              } else {
                clack.log.error(`${entry.type}: ${entry.message}`);
              }
            });
            clack.log.success(`Rollback completed for run ${result.runId}.`);
          }
          if (!result.ok) {
            process.exit(1);
          }
        } catch (error: any) {
          if (args.json) {
            console.log(JSON.stringify({ ok: false, error: String(error.message || error) }, null, 2));
          } else {
            clack.log.error(String(error.message || error));
          }
          process.exit(1);
        }
      },
    }),

    share: defineCommand({
      meta: {
        description: "Create a portable share kit for the active instance",
      },
      args: {
        json: {
          type: "boolean",
          default: false,
          description: "Print machine-readable output",
        },
      },
      async run({ args }) {
        const activeInstance = await getActiveInstance();
        if (!activeInstance) {
          clack.log.error("No active instance found. Run 'hatchling init' first.");
          process.exit(1);
        }
        const instancePath = getInstancePath(activeInstance);
        if (!existsSync(instancePath)) {
          clack.log.error(`Active instance path does not exist: ${instancePath}`);
          process.exit(1);
        }
        const { createShareKit } = await import("./system/share.js");
        try {
          const result = await createShareKit(instancePath, activeInstance);
          if (args.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            clack.log.success(`Share kit created for ${activeInstance}`);
            clack.log.info(`Kit: ${result.kitDir}`);
            clack.log.info(`Bundle: ${result.bundlePath}`);
            clack.log.info(`Quickstart: ${result.quickstartPath}`);
          }
        } catch (error: any) {
          if (args.json) {
            console.log(JSON.stringify({ ok: false, error: String(error.message || error) }, null, 2));
          } else {
            clack.log.error(String(error.message || error));
          }
          process.exit(1);
        }
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

    maintain: defineCommand({
      meta: {
        description: "Run autonomous maintenance (tick once or watch loop)",
      },
      args: {
        watch: {
          type: "boolean",
          description: "Run maintenance loop continuously",
          default: false,
        },
        interval: {
          type: "string",
          description: "Loop interval in milliseconds when --watch is set",
          default: "60000",
        },
      },
      async run({ args }) {
        const activeInstance = await getActiveInstance();
        if (!activeInstance) {
          clack.log.error("No active instance found. Run 'hatchling init' first.");
          process.exit(1);
        }

        const rootDir = getInstancePath(activeInstance);
        const { runMaintenanceTick, startMaintenanceLoop, stopMaintenanceLoop } = await import("./system/maintenance.js");
        if (!args.watch) {
          const report = await runMaintenanceTick(rootDir);
          clack.log.success(
            `Maintenance complete: lowEnergy=${report.lowEnergy}, autoSleep=${report.autoSleepTriggered}, telemetryPruned=${report.telemetryPruned}, stagingTrimmed=${report.stagingTrimmed}`,
          );
          return;
        }

        const interval = Number(args.interval || "60000");
        if (!Number.isFinite(interval) || interval < 1000) {
          clack.log.error(`Invalid interval: ${String(args.interval)} (must be >= 1000)`);
          process.exit(1);
        }

        await startMaintenanceLoop(rootDir, interval);
        clack.intro("🫀 Hatchling Maintenance Loop");
        clack.log.info(`Running every ${interval}ms for ${activeInstance}`);
        clack.log.info("Press Ctrl+C to stop.");
        process.on("SIGINT", () => {
          stopMaintenanceLoop(rootDir);
          process.exit(0);
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
