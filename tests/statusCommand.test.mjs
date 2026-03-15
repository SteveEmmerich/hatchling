import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("status command prints a core organism snapshot", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-status");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
  };

  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "status-seed",
      "--purpose",
      "Status snapshot",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const result = spawnSync("node", ["dist/cli.js", "status"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Hatchling Status/);
  assert.match(result.stdout, /Energy:/);
  assert.match(result.stdout, /Self-model:/);

  await fs.rm(testHome, { recursive: true, force: true });
});

test("status snapshot handles malformed optional state safely", async () => {
  const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-status-snapshot-"));
  process.env.HATCHLING_HOME = root;
  process.env.HATCHLING_INTERNAL_WRITE = "1";
  process.env.HATCHLING_CONTEXT = "cli";

  const { PathGuard } = await import("../dist/system/pathGuard.js");
  const { createInstance } = await import("../dist/system/instance.js");
  const { generateDNAFiles } = await import("../dist/system/dna-generator.js");
  const { getOrganismStatus, formatOrganismStatus } = await import("../dist/organism/status.js");

  PathGuard.setRoot(root);
  const instancePath = await createInstance({
    name: "status-mismatch",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });
  await generateDNAFiles(path.join(instancePath, "brain"), {
    name: "status-mismatch",
    purpose: "Snapshot test",
    personality: ["curious"],
  });

  await fs.mkdir(path.join(instancePath, "brain", "agents"), { recursive: true });
  await fs.writeFile(path.join(instancePath, "brain", "agents", "active_agents.json"), "{bad", "utf-8");
  await fs.writeFile(path.join(instancePath, "brain", "mutation_suggestions.json"), "{bad", "utf-8");
  await fs.writeFile(path.join(instancePath, "brain", "reflection_signals.json"), "{bad", "utf-8");
  await fs.writeFile(path.join(instancePath, "brain", "curiosity_state.json"), "{bad", "utf-8");

  const status = await getOrganismStatus(instancePath);
  const output = formatOrganismStatus(status);
  assert.match(output, /Hatchling Status/);
  assert.equal(typeof status.energy.level, "number");
  assert.equal(typeof status.tasks.queueDepth, "number");

  await fs.rm(root, { recursive: true, force: true });
  delete process.env.HATCHLING_HOME;
  delete process.env.HATCHLING_INTERNAL_WRITE;
  delete process.env.HATCHLING_CONTEXT;
});
