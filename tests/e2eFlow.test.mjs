import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("non-interactive e2e flow: init -> list -> start --smoke -> maintain -> skill install -> mcp -> doctor", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-e2e");
  const sourceSkillDir = path.join(process.cwd(), ".tmp-test-skill-source-e2e");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.rm(sourceSkillDir, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });
  await fs.mkdir(sourceSkillDir, { recursive: true });
  await fs.writeFile(path.join(sourceSkillDir, "SKILL.md"), "# e2e_bridge\n\nBridge skill.\n", "utf-8");

  const env = { ...process.env, HATCHLING_HOME: testHome, HATCHLING_HINDBRAIN_BACKEND: "cpu" };

  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--provider",
      "hindbrain",
      "--model",
      "hindbrain-1b",
      "--name",
      "e2e-seed",
      "--purpose",
      "Validate end to end lifecycle",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const list = spawnSync("node", ["dist/cli.js", "list"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(list.status, 0, `${list.stdout}\n${list.stderr}`);
  assert.match(`${list.stdout}\n${list.stderr}`, /e2e-seed/i);

  const smoke = spawnSync("node", ["dist/cli.js", "start", "--smoke"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(smoke.status, 0, `${smoke.stdout}\n${smoke.stderr}`);
  assert.match(`${smoke.stdout}\n${smoke.stderr}`, /Smoke check passed/i);

  const maintain = spawnSync("node", ["dist/cli.js", "maintain"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(maintain.status, 0, `${maintain.stdout}\n${maintain.stderr}`);
  assert.match(`${maintain.stdout}\n${maintain.stderr}`, /Maintenance complete/i);

  const skillInstall = spawnSync(
    "node",
    ["dist/cli.js", "skill", "install", sourceSkillDir, "--name", "e2e-bridge"],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf-8",
    },
  );
  assert.equal(skillInstall.status, 0, `${skillInstall.stdout}\n${skillInstall.stderr}`);

  const mcpAdd = spawnSync(
    "node",
    ["dist/cli.js", "mcp", "add", "fsbridge", "npx", "@modelcontextprotocol/server-filesystem", "/tmp"],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf-8",
    },
  );
  assert.equal(mcpAdd.status, 0, `${mcpAdd.stdout}\n${mcpAdd.stderr}`);

  const mcpList = spawnSync("node", ["dist/cli.js", "mcp", "list", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(mcpList.status, 0, `${mcpList.stdout}\n${mcpList.stderr}`);
  assert.match(mcpList.stdout, /fsbridge/i);

  const doctor = spawnSync("node", ["dist/cli.js", "doctor", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(doctor.status, 0, `${doctor.stdout}\n${doctor.stderr}`);
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.ok, true);

  await fs.rm(testHome, { recursive: true, force: true });
  await fs.rm(sourceSkillDir, { recursive: true, force: true });
});
