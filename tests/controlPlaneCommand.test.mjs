import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("config command flow: init -> validate -> apply updates state files", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-control-plane");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    OPENAI_API_KEY: "test-openai-key",
  };

  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "control-seed",
      "--purpose",
      "Validate control-plane flow",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const controlInit = spawnSync("node", ["dist/cli.js", "config", "init"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(controlInit.status, 0, `${controlInit.stdout}\n${controlInit.stderr}`);

  const activeName = (await fs.readFile(path.join(testHome, ".hatchling_active"), "utf-8")).trim();
  const instanceRoot = path.join(testHome, ".hatchlings", activeName);
  const controlPath = path.join(instanceRoot, "brain", "control-plane.json");
  const control = JSON.parse(await fs.readFile(controlPath, "utf-8"));
  control.provider = { name: "openai", model: "gpt-4o-mini" };
  control.capabilities["chat.openai"] = { enabled: true, metadata: {} };
  control.channels.telegram.botTokenEnvVar = "TG_TOKEN_CUSTOM";
  control.channels.telegram.chatIdEnvVar = "TG_CHAT_CUSTOM";
  control.channels.telegram.enabled = true;
  control.policies.skillInstall.requireApprovalForUntrusted = false;
  control.policies.evolve.enforceApprovals = true;
  await fs.writeFile(controlPath, JSON.stringify(control, null, 2), "utf-8");

  const validate = spawnSync("node", ["dist/cli.js", "config", "validate"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(validate.status, 0, `${validate.stdout}\n${validate.stderr}`);

  const apply = spawnSync("node", ["dist/cli.js", "config", "apply", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(apply.status, 0, `${apply.stdout}\n${apply.stderr}`);
  const applyResult = JSON.parse(apply.stdout);
  assert.equal(applyResult.ok, true);

  const configPath = path.join(instanceRoot, "brain", "config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
  assert.equal(config.provider, "openai");
  assert.equal(config.model, "gpt-4o-mini");

  const capsPath = path.join(instanceRoot, "brain", "capabilities.json");
  const caps = JSON.parse(await fs.readFile(capsPath, "utf-8"));
  assert.equal(caps.capabilities["chat.openai"].enabled, true);
  assert.equal(caps.capabilities["channel.telegram"].enabled, true);
  assert.equal(caps.capabilities["channel.telegram"].metadata.botTokenEnvVar, "TG_TOKEN_CUSTOM");
  assert.equal(caps.capabilities["channel.telegram"].metadata.chatIdEnvVar, "TG_CHAT_CUSTOM");

  const telegramSkill = path.join(instanceRoot, "limbs", "telegram-gateway", "SKILL.md");
  await fs.access(telegramSkill);

  const skillPolicyPath = path.join(instanceRoot, "brain", "skill_policy.json");
  const skillPolicy = JSON.parse(await fs.readFile(skillPolicyPath, "utf-8"));
  assert.equal(skillPolicy.requireApprovalForUntrusted, false);

  const evolvePolicyPath = path.join(instanceRoot, "brain", "evolve_policy.json");
  const evolvePolicy = JSON.parse(await fs.readFile(evolvePolicyPath, "utf-8"));
  assert.equal(evolvePolicy.enforceApprovals, true);

  await fs.rm(testHome, { recursive: true, force: true });
});
