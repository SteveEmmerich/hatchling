import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("channel live test-message uses provider API via injected fetch", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-channel-live");
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
      "channel-live-seed",
      "--purpose",
      "Validate live channel transport hook",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const bootstrap = spawnSync("node", ["dist/cli.js", "channel", "bootstrap", "telegram"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(bootstrap.status, 0, `${bootstrap.stdout}\n${bootstrap.stderr}`);

  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_CHAT_ID = "123";

  const { sendChannelTestMessage } = await import("../dist/system/channels.js");
  const instanceRoot = path.join(testHome, ".hatchlings", "channel-live-seed");

  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      async json() {
        return { ok: true, result: { message_id: 42 } };
      },
      async text() {
        return "";
      },
    };
  };

  const result = await sendChannelTestMessage(
    instanceRoot,
    "telegram",
    "hello live path",
    { mode: "live", fetchImpl: fakeFetch },
  );
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.match(String(calls[0].url), /api\.telegram\.org\/bottest-token\/sendMessage/i);

  const outbox = await fs.readFile(result.outboxPath, "utf-8");
  assert.match(outbox, /"simulated":false/);
  assert.match(outbox, /"mode":"live"/);

  await fs.rm(testHome, { recursive: true, force: true });
});
