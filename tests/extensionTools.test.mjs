import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";

test("extension registers evolution tools and executes mutate_self/sync_germline", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-extension");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  process.env.HATCHLING_HOME = testHome;
  process.env.HATCHLING_INTERNAL_WRITE = "1";

  const instance = await import("../dist/system/instance.js");
  const { generateDNAFiles } = await import("../dist/system/dna-generator.js");

  const instancePath = await instance.createInstance({
    name: "ext",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });
  await generateDNAFiles(path.join(instancePath, "brain"), {
    name: "ext",
    purpose: "Tool integration test",
    personality: ["curious"],
  });

  process.env.HATCHLING_INSTANCE_PATH = instancePath;

  const tools = new Map();
  const commands = new Map();
  const handlers = new Map();

  const piMock = {
    on(event, handler) {
      handlers.set(event, handler);
    },
    registerCommand(name, def) {
      commands.set(name, def);
    },
    registerTool(def) {
      tools.set(def.name, def);
    },
    async setModel() {
      return true;
    },
  };

  const extensionModule = await import("../dist/extension.js");
  extensionModule.default(piMock);

  assert.ok(commands.has("vitals"));
  assert.ok(commands.has("sleep"));
  assert.ok(commands.has("maintenance"));
  assert.ok(commands.has("good"));
  assert.ok(commands.has("bad"));
  assert.ok(tools.has("mutate_self"));
  assert.ok(tools.has("sync_germline"));
  assert.ok(tools.has("generate_backup"));
  assert.ok(tools.has("install_skill"));
  assert.ok(tools.has("evolve_goal"));
  assert.ok(tools.has("autonomy_loop"));

  const mutateSelf = tools.get("mutate_self");
  const mutateResult = await mutateSelf.execute("tool-call-1", {
    filePath: "../../../../outside.ts",
    content: "export const bad = true;",
    reason: "ensure territory protection",
  });
  const mutateDetails = mutateResult.details;
  assert.equal(mutateDetails.success, false);
  assert.match(mutateDetails.message, /outside instance territory/i);

  // Positive-path mutation similar to a real user ask: "give yourself a web interface".
  const webInterfaceModule = `
export interface WebInterfaceConfig {
  title: string;
  subtitle: string;
}

export function renderWebInterface(config: WebInterfaceConfig): string {
  return \`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>\${config.title}</title>
    <style>
      :root { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #f4f7ff, #eef9f2); }
      main { max-width: 720px; padding: 2rem; border-radius: 16px; background: #ffffffd9; box-shadow: 0 18px 50px rgba(12, 24, 42, 0.12); }
      h1 { margin: 0 0 0.75rem; font-size: 2rem; }
      p { margin: 0; color: #344054; }
    </style>
  </head>
  <body>
    <main>
      <h1>\${config.title}</h1>
      <p>\${config.subtitle}</p>
    </main>
  </body>
</html>\`;
}
`.trim();

  const successfulMutation = await mutateSelf.execute("tool-call-1b", {
    filePath: "system/web-interface.ts",
    content: webInterfaceModule,
    reason: "Add a minimal first-party web interface rendering module for future UI evolution.",
  });
  assert.equal(successfulMutation.details.success, true);
  assert.match(successfulMutation.content[0].text, /mutation succeeded/i);

  const mutatedPath = path.join(instancePath, "src", "system", "web-interface.ts");
  const mutatedContent = await fs.readFile(mutatedPath, "utf-8");
  assert.match(mutatedContent, /renderWebInterface/);

  const syncGermline = tools.get("sync_germline");
  const syncResult = await syncGermline.execute("tool-call-2", {});
  assert.equal(typeof syncResult.details.success, "boolean");

  const backupTool = tools.get("generate_backup");
  const backupResult = await backupTool.execute("tool-call-3", {});
  assert.equal(backupResult.details.success, true);
  assert.match(backupResult.content[0].text, /backup snapshot completed/i);
  await fs.access(backupResult.details.bundlePath);

  const repoDir = path.join(process.cwd(), ".tmp-skill-repo-extension");
  await fs.rm(repoDir, { recursive: true, force: true });
  await fs.mkdir(repoDir, { recursive: true });
  await fs.writeFile(path.join(repoDir, "SKILL.md"), "# ext_repo_skill\n\nskill from repo\n", "utf-8");
  execSync("git init", { cwd: repoDir, stdio: "ignore" });
  execSync('git config user.name "Test"', { cwd: repoDir, stdio: "ignore" });
  execSync('git config user.email "test@example.com"', { cwd: repoDir, stdio: "ignore" });
  execSync("git config commit.gpgsign false", { cwd: repoDir, stdio: "ignore" });
  execSync("git add .", { cwd: repoDir, stdio: "ignore" });
  execSync('git commit -m "init skill"', { cwd: repoDir, stdio: "ignore" });

  const installSkill = tools.get("install_skill");
  const installResult = await installSkill.execute("tool-call-4", {
    source: `file://${repoDir}`,
    name: "repo-skill",
  });
  assert.equal(installResult.details.success, true);
  assert.match(installResult.content[0].text, /installed skill/i);
  await fs.access(path.join(instancePath, "limbs", "repo-skill", "SKILL.md"));

  const blockedInstall = await installSkill.execute("tool-call-4b", {
    source: "https://untrusted.example.com/repo.git",
  });
  assert.equal(blockedInstall.details.success, false);
  assert.match(blockedInstall.content[0].text, /untrusted repository source/i);

  const evolveGoal = tools.get("evolve_goal");
  const evolvePlan = await evolveGoal.execute("tool-call-4c", {
    goal: "Create a web interface and run maintenance",
  });
  assert.equal(evolvePlan.details.success, true);
  assert.equal(evolvePlan.details.plan.actions.length >= 2, true);

  const blockedEvolve = await evolveGoal.execute("tool-call-4d", {
    goal: "Use Claude for better chat quality",
    execute: true,
    requireApproval: true,
  });
  assert.equal(blockedEvolve.details.success, false);
  assert.match(String(blockedEvolve.details.error || ""), /approval required/i);

  const autonomyLoop = tools.get("autonomy_loop");
  const autonomyPlan = await autonomyLoop.execute("tool-call-4e", {
    goal: "Enable Telegram gateway then run maintenance",
    maxSteps: 4,
  });
  assert.equal(typeof autonomyPlan.details.ok, "boolean");
  assert.equal(autonomyPlan.details.steps.length >= 1, true);

  await fs.rm(repoDir, { recursive: true, force: true });

  await instance.deleteInstance("ext");
  await fs.rm(testHome, { recursive: true, force: true });
});
