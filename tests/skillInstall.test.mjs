import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync, execSync } from "node:child_process";

test("skill install command installs local skill directory into active limbs", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-skill-install");
  const sourceSkillDir = path.join(process.cwd(), ".tmp-test-skill-source");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.rm(sourceSkillDir, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });
  await fs.mkdir(sourceSkillDir, { recursive: true });
  await fs.writeFile(
    path.join(sourceSkillDir, "SKILL.md"),
    "# web_bridge\n\nInstall a web bridge skill.\n",
    "utf-8",
  );
  await fs.writeFile(
    path.join(sourceSkillDir, "manifest.json"),
    JSON.stringify({ name: "web_bridge", version: "1.0.0" }, null, 2),
    "utf-8",
  );

  const env = { ...process.env, HATCHLING_HOME: testHome, HATCHLING_HINDBRAIN_BACKEND: "cpu" };

  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "install-seed",
      "--purpose",
      "Validate skill install flow",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const install = spawnSync(
    "node",
    ["dist/cli.js", "skill", "install", sourceSkillDir, "--name", "web-bridge"],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf-8",
    },
  );
  assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

  const list = spawnSync("node", ["dist/cli.js", "skill", "list"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(list.status, 0, `${list.stdout}\n${list.stderr}`);
  assert.match(`${list.stdout}\n${list.stderr}`, /Active: .*web-bridge/i);

  await fs.rm(testHome, { recursive: true, force: true });
  await fs.rm(sourceSkillDir, { recursive: true, force: true });
});

test("skill install command installs from repository URL", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-skill-install-repo");
  const repoDir = path.join(process.cwd(), ".tmp-test-skill-repo");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.rm(repoDir, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });
  await fs.mkdir(repoDir, { recursive: true });
  await fs.mkdir(path.join(repoDir, "skills", "bridge"), { recursive: true });
  await fs.writeFile(
    path.join(repoDir, "skills", "bridge", "SKILL.md"),
    "# bridge\n\nBridge from repo.\n",
    "utf-8",
  );
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
      "install-repo-seed",
      "--purpose",
      "Validate repo skill install flow",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const install = spawnSync(
    "node",
    [
      "dist/cli.js",
      "skill",
      "install",
      `file://${repoDir}`,
      "--subdir",
      "skills/bridge",
      "--name",
      "repo-bridge",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

  const list = spawnSync("node", ["dist/cli.js", "skill", "list"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(list.status, 0, `${list.stdout}\n${list.stderr}`);
  assert.match(`${list.stdout}\n${list.stderr}`, /Active: .*repo-bridge/i);

  await fs.rm(testHome, { recursive: true, force: true });
  await fs.rm(repoDir, { recursive: true, force: true });
});

test("skill install command blocks untrusted repository without approval", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-skill-install-untrusted");
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
      "install-untrusted-seed",
      "--purpose",
      "Validate skill install trust policy",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const install = spawnSync(
    "node",
    ["dist/cli.js", "skill", "install", "https://untrusted.example.com/repo.git"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.notEqual(install.status, 0, `${install.stdout}\n${install.stderr}`);
  assert.match(`${install.stdout}\n${install.stderr}`, /Untrusted repository source/i);

  await fs.rm(testHome, { recursive: true, force: true });
});
