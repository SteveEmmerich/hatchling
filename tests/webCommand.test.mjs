import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("web --snapshot renders dashboard HTML for active instance", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-web");
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
      "web-seed",
      "--purpose",
      "Validate dashboard rendering",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const web = spawnSync("node", ["dist/cli.js", "web", "--snapshot"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(web.status, 0, `${web.stdout}\n${web.stderr}`);
  assert.match(web.stdout, /<!doctype html>/i);
  assert.match(web.stdout, /Dashboard/i);
  assert.match(web.stdout, /HATCHLING VITALS/i);
  assert.match(web.stdout, /<svg/i);
  assert.match(web.stdout, /@keyframes breath/i);
  assert.match(web.stdout, /trusted bonds:/i);
  assert.match(web.stdout, /pending goals:/i);

  await fs.rm(testHome, { recursive: true, force: true });
});

test("web --snapshot tolerates legacy instances missing mutation state", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-web-legacy");
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
      "web-legacy-seed",
      "--purpose",
      "Validate legacy dashboard rendering",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const mutationStatePath = path.join(testHome, ".hatchlings", "web-legacy-seed", "brain", "mutation_state.json");
  await fs.rm(mutationStatePath, { force: true });

  const web = spawnSync("node", ["dist/cli.js", "web", "--snapshot"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(web.status, 0, `${web.stdout}\n${web.stderr}`);
  assert.match(web.stdout, /<!doctype html>/i);
  assert.match(web.stdout, /Mutations Today:\s+0/i);
  assert.match(web.stdout, /<svg/i);

  await fs.rm(testHome, { recursive: true, force: true });
});
