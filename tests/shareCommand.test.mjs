import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("share command creates a portable kit with bundle and quickstart", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-share");
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
      "share-seed",
      "--purpose",
      "Validate share kit output",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const share = spawnSync("node", ["dist/cli.js", "share", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(share.status, 0, `${share.stdout}\n${share.stderr}`);
  const output = JSON.parse(share.stdout);
  assert.equal(output.ok, true);
  assert.match(output.kitDir, /memory\/share-kits\/share_/i);

  await fs.access(output.bundlePath);
  await fs.access(output.manifestPath);
  await fs.access(output.quickstartPath);

  const manifest = JSON.parse(await fs.readFile(output.manifestPath, "utf-8"));
  assert.equal(manifest.instance, "share-seed");
  assert.match(String(manifest.bundle || ""), /\.bundle$/i);

  const quickstart = await fs.readFile(output.quickstartPath, "utf-8");
  assert.match(quickstart, /Hatchling Share Kit/i);
  assert.match(quickstart, /git clone/i);

  await fs.rm(testHome, { recursive: true, force: true });
});
