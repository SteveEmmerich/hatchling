import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("skill pipeline: stage -> list -> promote", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-skills");
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
      "skills-seed",
      "--purpose",
      "Validate skill pipeline",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const stage = spawnSync(
    "node",
    ["dist/cli.js", "skill", "stage", "web-vision", "Render a browser dashboard for hatchling status"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(stage.status, 0, `${stage.stdout}\n${stage.stderr}`);

  const listBefore = spawnSync("node", ["dist/cli.js", "skill", "list"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(listBefore.status, 0, `${listBefore.stdout}\n${listBefore.stderr}`);
  assert.match(`${listBefore.stdout}\n${listBefore.stderr}`, /Staged: .*web-vision/i);

  const promote = spawnSync("node", ["dist/cli.js", "skill", "promote", "web-vision"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(promote.status, 0, `${promote.stdout}\n${promote.stderr}`);

  const listAfter = spawnSync("node", ["dist/cli.js", "skill", "list"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(listAfter.status, 0, `${listAfter.stdout}\n${listAfter.stderr}`);
  const output = `${listAfter.stdout}\n${listAfter.stderr}`;
  assert.match(output, /Active: .*web-vision/i);
  assert.match(output, /Staged: \(none\)/i);

  await fs.rm(testHome, { recursive: true, force: true });
});
