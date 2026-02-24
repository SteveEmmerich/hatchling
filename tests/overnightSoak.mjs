import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    hours: 8,
    intervalSec: 300,
    home: path.join(process.cwd(), ".tmp-soak-home"),
    instance: "soak-hatchling",
    keepHome: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--hours" && argv[i + 1]) args.hours = Number(argv[++i]);
    else if (token === "--intervalSec" && argv[i + 1]) args.intervalSec = Number(argv[++i]);
    else if (token === "--home" && argv[i + 1]) args.home = String(argv[++i]);
    else if (token === "--instance" && argv[i + 1]) args.instance = String(argv[++i]);
    else if (token === "--keepHome") args.keepHome = true;
  }
  if (!Number.isFinite(args.hours) || args.hours <= 0) throw new Error("Invalid --hours value.");
  if (!Number.isFinite(args.intervalSec) || args.intervalSec <= 0) throw new Error("Invalid --intervalSec value.");
  return args;
}

function runCli(env, cliArgs) {
  const run = spawnSync("node", ["dist/cli.js", ...cliArgs], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  return {
    ok: run.status === 0,
    status: run.status ?? -1,
    stdout: String(run.stdout || ""),
    stderr: String(run.stderr || ""),
    command: `node dist/cli.js ${cliArgs.join(" ")}`,
  };
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const start = new Date();
  const durationMs = Math.floor(args.hours * 60 * 60 * 1000);
  const endAt = start.getTime() + durationMs;
  const reportDir = path.join(process.cwd(), "memory", "soak");
  const reportPath = path.join(reportDir, `overnight-soak-${start.toISOString().replaceAll(":", "-")}.json`);

  await fs.mkdir(reportDir, { recursive: true });
  await fs.rm(args.home, { recursive: true, force: true });
  await fs.mkdir(args.home, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: args.home,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    HATCHLING_INTERNAL_WRITE: "1",
  };

  const preflight = [];
  preflight.push(runCli(env, [
    "init",
    "--non-interactive",
    "--name",
    args.instance,
    "--purpose",
    "Overnight soak reliability validation",
    "--personality",
    "curious,direct,steady",
  ]));
  preflight.push(runCli(env, ["config", "init"]));
  preflight.push(runCli(env, ["channel", "policy", "--json"]));
  preflight.push(runCli(env, ["start", "--daemon"]));
  preflight.push(runCli(env, ["start", "--daemonStatus"]));

  const report = {
    startedAt: start.toISOString(),
    plannedHours: args.hours,
    intervalSec: args.intervalSec,
    home: args.home,
    instance: args.instance,
    preflight,
    cycles: [],
    failedCommands: [],
    completedAt: "",
    totalCycles: 0,
    totalFailures: 0,
    ok: true,
  };

  for (const step of preflight) {
    if (!step.ok) {
      report.failedCommands.push({ phase: "preflight", ...step });
    }
  }
  if (report.failedCommands.length > 0) {
    report.ok = false;
    report.completedAt = new Date().toISOString();
    report.totalFailures = report.failedCommands.length;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
    throw new Error(`Preflight failed. See ${reportPath}`);
  }

  let cycleIndex = 0;
  while (Date.now() < endAt) {
    cycleIndex += 1;
    const cycleStartedAt = new Date().toISOString();
    const commands = [
      ["doctor", "--json"],
      ["maintain"],
      ["creature", "show", "--json"],
      ["autonomy", "review backlog then run maintenance", "--maxSteps", "2", "--json"],
      ["web", "--snapshot", "--json"],
      ["creature", "randomize", "--json"],
      ["start", "--daemonStatus"],
    ];
    const results = commands.map((cmd) => runCli(env, cmd));
    for (const result of results) {
      if (!result.ok) {
        report.failedCommands.push({
          phase: "cycle",
          cycle: cycleIndex,
          startedAt: cycleStartedAt,
          ...result,
        });
      }
    }
    report.cycles.push({
      cycle: cycleIndex,
      startedAt: cycleStartedAt,
      ok: results.every((entry) => entry.ok),
      commands: results.map((entry) => ({
        command: entry.command,
        ok: entry.ok,
        status: entry.status,
      })),
    });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");
    await sleepMs(args.intervalSec * 1000);
  }

  const shutdown = runCli(env, ["start", "--stopDaemon"]);
  if (!shutdown.ok) {
    report.failedCommands.push({ phase: "shutdown", ...shutdown });
  }

  report.completedAt = new Date().toISOString();
  report.totalCycles = report.cycles.length;
  report.totalFailures = report.failedCommands.length;
  report.ok = report.totalFailures === 0;
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

  if (!args.keepHome) {
    await fs.rm(args.home, { recursive: true, force: true });
  }

  if (!report.ok) {
    throw new Error(`Soak run completed with failures. Report: ${reportPath}`);
  }

  console.log(`Soak run passed. Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
