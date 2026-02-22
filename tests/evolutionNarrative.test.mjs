import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("evolution narrative: stage skill, promote skill, and mutate web limb", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-evolution-narrative");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    HATCHLING_INTERNAL_WRITE: "1",
  };
  process.env.HATCHLING_HOME = testHome;
  process.env.HATCHLING_INTERNAL_WRITE = "1";

  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "narrative-seed",
      "--purpose",
      "Validate organic evolution narrative",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const discoveredName = (await fs.readFile(path.join(testHome, ".hatchling_active"), "utf-8")).trim();
  assert.match(discoveredName, /^narrative-seed(?:-\d+)?$/i);

  const instancePath = path.join(testHome, ".hatchlings", discoveredName);
  const { stageSkill, promoteSkill, listSkills } = await import("../dist/system/skills.js");
  await stageSkill(instancePath, "web-grower", "Grow and maintain user-facing web capabilities.");
  await promoteSkill(instancePath, "web-grower");
  const listed = await listSkills(instancePath);
  assert.ok(listed.active.includes("web-grower"));

  process.env.HATCHLING_INSTANCE_PATH = instancePath;
  process.env.HATCHLING_HOME = testHome;
  process.env.HATCHLING_INTERNAL_WRITE = "1";

  const tools = new Map();
  const piMock = {
    on() {},
    registerCommand() {},
    registerTool(def) {
      tools.set(def.name, def);
    },
    async setModel() {
      return true;
    },
  };

  const extensionModule = await import("../dist/extension.js");
  extensionModule.default(piMock);
  assert.ok(tools.has("mutate_self"));

  const mutateSelf = tools.get("mutate_self");
  const webLimb = `
export function renderHatchlingWebLimb(title: string): string {
  return \`<!doctype html><html><head><meta charset="utf-8" /><title>\${title}</title></head><body><h1>\${title}</h1><p>Organic evolution online.</p></body></html>\`;
}
`.trim();

  const mutation = await mutateSelf.execute("narrative-mutation", {
    filePath: "system/web-limb.ts",
    content: webLimb,
    reason: "Add a first-party web limb the hatchling can evolve over time.",
  });
  assert.equal(mutation.details.success, true, JSON.stringify(mutation.details));

  const mutatedPath = path.join(instancePath, "src", "system", "web-limb.ts");
  await fs.access(mutatedPath);
  const mutatedContent = await fs.readFile(mutatedPath, "utf-8");
  assert.match(mutatedContent, /renderHatchlingWebLimb/);

  const webSnapshot = spawnSync("node", ["dist/cli.js", "web", "--snapshot"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(webSnapshot.status, 0, `${webSnapshot.stdout}\n${webSnapshot.stderr}`);
  assert.match(webSnapshot.stdout, /<!doctype html>/i);

  await fs.rm(testHome, { recursive: true, force: true });
});
