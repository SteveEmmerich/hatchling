import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("mcp command flow: add -> list -> export -> remove", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-mcp");
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
      "mcp-seed",
      "--purpose",
      "Validate MCP management",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const add = spawnSync(
    "node",
    ["dist/cli.js", "mcp", "add", "filesystem", "npx", "@modelcontextprotocol/server-filesystem", "/tmp"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(add.status, 0, `${add.stdout}\n${add.stderr}`);

  const list = spawnSync("node", ["dist/cli.js", "mcp", "list", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(list.status, 0, `${list.stdout}\n${list.stderr}`);
  const servers = JSON.parse(list.stdout);
  assert.equal(servers.length, 1);
  assert.equal(servers[0].name, "filesystem");

  const exported = spawnSync("node", ["dist/cli.js", "mcp", "export"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(exported.status, 0, `${exported.stdout}\n${exported.stderr}`);
  const piConfig = JSON.parse(exported.stdout);
  assert.equal(piConfig.filesystem.command, "npx");
  assert.deepEqual(piConfig.filesystem.args, ["@modelcontextprotocol/server-filesystem", "/tmp"]);

  const remove = spawnSync("node", ["dist/cli.js", "mcp", "remove", "filesystem"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(remove.status, 0, `${remove.stdout}\n${remove.stderr}`);

  const listAfter = spawnSync("node", ["dist/cli.js", "mcp", "list", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(listAfter.status, 0, `${listAfter.stdout}\n${listAfter.stderr}`);
  const after = JSON.parse(listAfter.stdout);
  assert.equal(after.length, 0);

  await fs.rm(testHome, { recursive: true, force: true });
});
