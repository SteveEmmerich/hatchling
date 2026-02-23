import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("creature command show/mutate/randomize updates genome safely", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-creature-command");
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
      "pet-seed",
      "--purpose",
      "Validate creature command",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const show = spawnSync("node", ["dist/cli.js", "creature", "show", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(show.status, 0, `${show.stdout}\n${show.stderr}`);
  const shown = JSON.parse(show.stdout);
  assert.equal(shown.genome.version, 1);

  const mutate = spawnSync(
    "node",
    ["dist/cli.js", "creature", "mutate", "--palette", "sunset", "--eyes", "star", "--json"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(mutate.status, 0, `${mutate.stdout}\n${mutate.stderr}`);
  const mutated = JSON.parse(mutate.stdout);
  assert.equal(mutated.ok, true);
  assert.equal(mutated.genome.palette, "sunset");
  assert.equal(mutated.genome.eyes, "star");

  const randomize = spawnSync("node", ["dist/cli.js", "creature", "randomize", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(randomize.status, 0, `${randomize.stdout}\n${randomize.stderr}`);
  const randomized = JSON.parse(randomize.stdout);
  assert.equal(randomized.ok, true);
  assert.equal(randomized.genome.mutationCount >= mutated.genome.mutationCount, true);

  await fs.rm(testHome, { recursive: true, force: true });
});
