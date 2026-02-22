import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync, execSync } from "node:child_process";

test("evolve command dry-runs a plan from goal text", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-evolve-plan");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = { ...process.env, HATCHLING_HOME: testHome, HATCHLING_HINDBRAIN_BACKEND: "cpu" };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "evolve-plan-seed",
      "--purpose",
      "Validate evolve planner",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const plan = spawnSync(
    "node",
    ["dist/cli.js", "evolve", "Create a web interface and run maintenance", "--json"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(plan.status, 0, `${plan.stdout}\n${plan.stderr}`);
  const output = JSON.parse(plan.stdout);
  assert.equal(output.mode, "plan");
  assert.equal(Array.isArray(output.plan.actions), true);
  assert.equal(output.plan.actions.length >= 2, true);

  await fs.rm(testHome, { recursive: true, force: true });
});

test("evolve command executes repo skill install action", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-evolve-exec");
  const repoDir = path.join(process.cwd(), ".tmp-test-skill-repo-evolve");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.rm(repoDir, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });
  await fs.mkdir(path.join(repoDir, "skills", "auto"), { recursive: true });
  await fs.writeFile(path.join(repoDir, "skills", "auto", "SKILL.md"), "# auto\n\nauto skill\n", "utf-8");
  execSync("git init", { cwd: repoDir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: repoDir, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: "ignore" });
  execSync("git config commit.gpgsign false", { cwd: repoDir, stdio: "ignore" });
  execSync("git add .", { cwd: repoDir, stdio: "ignore" });
  execSync('git commit -m "init repo skill"', { cwd: repoDir, stdio: "ignore" });

  const env = { ...process.env, HATCHLING_HOME: testHome, HATCHLING_HINDBRAIN_BACKEND: "cpu" };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "evolve-exec-seed",
      "--purpose",
      "Validate evolve execution",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const goal = `Install skill from file://${repoDir}`;
  const execute = spawnSync(
    "node",
    [
      "dist/cli.js",
      "evolve",
      goal,
      "--execute",
      "--skillSubdir",
      "skills/auto",
      "--json",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(execute.status, 0, `${execute.stdout}\n${execute.stderr}`);
  const output = JSON.parse(execute.stdout);
  assert.equal(output.mode, "execute");
  assert.equal(output.results.some((result) => result.type === "install_skill" && result.success), true);

  const list = spawnSync("node", ["dist/cli.js", "skill", "list"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(list.status, 0, `${list.stdout}\n${list.stderr}`);
  assert.match(`${list.stdout}\n${list.stderr}`, /Active: .*auto/i);

  await fs.rm(testHome, { recursive: true, force: true });
  await fs.rm(repoDir, { recursive: true, force: true });
});

test("evolve command enables optional chat provider when requested", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-evolve-provider");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    ANTHROPIC_API_KEY: "test-anthropic-key",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "evolve-provider-seed",
      "--purpose",
      "Validate provider enable via evolve",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const execute = spawnSync(
    "node",
    [
      "dist/cli.js",
      "evolve",
      "Use Claude for better chat quality",
      "--execute",
      "--json",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(execute.status, 0, `${execute.stdout}\n${execute.stderr}`);
  const output = JSON.parse(execute.stdout);
  assert.equal(
    output.results.some((result) => result.type === "enable_capability" && result.success),
    true,
  );

  const configPath = path.join(testHome, ".hatchlings", "evolve-provider-seed", "brain", "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
  assert.equal(config.provider, "anthropic");

  await fs.rm(testHome, { recursive: true, force: true });
});

test("evolve execute enforces approval for risky actions when requested", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-evolve-approval");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    ANTHROPIC_API_KEY: "test-anthropic-key",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "evolve-approval-seed",
      "--purpose",
      "Validate approval gates",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const blocked = spawnSync(
    "node",
    [
      "dist/cli.js",
      "evolve",
      "Use Claude for better chat quality",
      "--execute",
      "--enforceApprovals",
      "--json",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.notEqual(blocked.status, 0, `${blocked.stdout}\n${blocked.stderr}`);
  const blockedOutput = JSON.parse(blocked.stdout);
  assert.match(blockedOutput.error, /Approvals required/i);

  const approved = spawnSync(
    "node",
    [
      "dist/cli.js",
      "evolve",
      "Use Claude for better chat quality",
      "--execute",
      "--enforceApprovals",
      "--approvePlan",
      "--json",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(approved.status, 0, `${approved.stdout}\n${approved.stderr}`);
  const approvedOutput = JSON.parse(approved.stdout);
  assert.equal(approvedOutput.results.some((r) => r.type === "enable_capability" && r.success), true);

  await fs.rm(testHome, { recursive: true, force: true });
});
