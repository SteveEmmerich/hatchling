import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseJsonPayload(stdout) {
  const text = String(stdout || "").trim();
  const start = text.indexOf("{");
  if (start === -1) throw new Error(`No JSON payload found: ${text}`);
  return JSON.parse(text.slice(start));
}

test("pilot snapshot exports health artifact and checklist metadata", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-pilot");
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
      "pilot-seed",
      "--purpose",
      "Validate pilot command flow",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const snapshot = spawnSync("node", ["dist/cli.js", "pilot", "snapshot", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(snapshot.status, 0, `${snapshot.stdout}\n${snapshot.stderr}`);
  const payload = parseJsonPayload(snapshot.stdout);
  assert.equal(payload.ok, true);
  assert.equal(typeof payload.path, "string");
  assert.equal(typeof payload.checklistOk, "boolean");

  const exported = JSON.parse(await fs.readFile(payload.path, "utf-8"));
  assert.equal(exported.activeInstance, "pilot-seed");
  assert.equal(Array.isArray(exported.checklist), true);
  assert.equal(typeof exported.routing.telegramDecisions, "number");
  assert.equal(typeof exported.autonomy.pendingGoals, "number");

  await fs.rm(testHome, { recursive: true, force: true });
});

test("pilot checklist passes once daemon/autonomy/routing signals are present", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-pilot-checklist");
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
      "pilot-checklist-seed",
      "--purpose",
      "Validate pilot checklist pass state",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const daemon = spawnSync("node", ["dist/cli.js", "start", "--daemon"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(daemon.status, 0, `${daemon.stdout}\n${daemon.stderr}`);

  const autonomy = spawnSync(
    "node",
    ["dist/cli.js", "autonomy", "run maintenance", "--maxSteps", "1", "--json"],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(autonomy.status, 0, `${autonomy.stdout}\n${autonomy.stderr}`);

  const routingPath = path.join(
    testHome,
    ".hatchlings",
    "pilot-checklist-seed",
    "memory",
    "channels",
    "telegram",
    "routing.jsonl",
  );
  await fs.mkdir(path.dirname(routingPath), { recursive: true });
  await fs.writeFile(
    routingPath,
    `${JSON.stringify({ routeName: "help", at: new Date().toISOString() })}\n`,
    "utf-8",
  );

  const checklist = spawnSync("node", ["dist/cli.js", "pilot", "checklist", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(checklist.status, 0, `${checklist.stdout}\n${checklist.stderr}`);
  const payload = parseJsonPayload(checklist.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.checklist.every((item) => item.passed), true);

  spawnSync("node", ["dist/cli.js", "start", "--stopDaemon"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  await fs.rm(testHome, { recursive: true, force: true });
});
