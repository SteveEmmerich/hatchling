import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("telegram channel runtime tick ingests updates with injected fetch", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-channel-runtime-telegram");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    HATCHLING_REFLEX_CHECK: "0",
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "123",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "channel-runtime-telegram-seed",
      "--purpose",
      "Validate telegram channel runtime",
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
  process.env.HATCHLING_REFLEX_CHECK = "0";

  const { runChannelRuntimeTick } = await import("../dist/system/channel-runtime.js");
  const rootDir = path.join(testHome, ".hatchlings", "channel-runtime-telegram-seed");
  let fetchCalls = 0;
  const fakeFetch = async (url) => {
    fetchCalls += 1;
    assert.match(String(url), /getUpdates/i);
    return {
      ok: true,
      async json() {
        return {
          ok: true,
          result: [
            {
              update_id: 9001,
              message: {
                text: "hello from telegram",
                chat: { id: "123" },
                from: { id: "777" },
              },
            },
          ],
        };
      },
      async text() {
        return "";
      },
    };
  };

  const report = await runChannelRuntimeTick(rootDir, "telegram", { fetchImpl: fakeFetch });
  assert.equal(report.ok, true);
  assert.equal(report.processed, 1);
  assert.equal(fetchCalls, 1);

  const inboxPath = path.join(rootDir, "memory", "channels", "telegram", "inbox.jsonl");
  const inbox = await fs.readFile(inboxPath, "utf-8");
  assert.match(inbox, /hello from telegram/i);

  const statePath = path.join(rootDir, "memory", "channels", "telegram", "runtime_state.json");
  const state = JSON.parse(await fs.readFile(statePath, "utf-8"));
  assert.equal(state.telegramOffset, 9002);

  await fs.rm(testHome, { recursive: true, force: true });
});

test("telegram channel runtime applies route policy and custom reply template", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-channel-runtime-telegram-policy");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    HATCHLING_REFLEX_CHECK: "0",
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "123",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "channel-runtime-telegram-policy-seed",
      "--purpose",
      "Validate telegram channel policy routing",
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
  process.env.HATCHLING_REFLEX_CHECK = "0";

  const rootDir = path.join(testHome, ".hatchlings", "channel-runtime-telegram-policy-seed");
  const policyPath = path.join(rootDir, "brain", "channel_policy.json");
  const policy = JSON.parse(await fs.readFile(policyPath, "utf-8"));
  policy.telegram.routes = [
    {
      name: "priority_help",
      match: { containsAny: ["help"], startsWithAny: [], senderAllowlist: [] },
      responseTemplate: "Priority support response to {{sender}}",
      suppressReply: false,
    },
  ];
  await fs.writeFile(policyPath, JSON.stringify(policy, null, 2), "utf-8");

  const { runChannelRuntimeTick } = await import("../dist/system/channel-runtime.js");
  const sentMessages = [];
  const fakeFetch = async (url, initReq) => {
    const asString = String(url);
    if (/getUpdates/i.test(asString)) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            result: [
              {
                update_id: 9101,
                message: {
                  text: "thanks, please help",
                  chat: { id: "123" },
                  from: { id: "777" },
                },
              },
              {
                update_id: 9102,
                message: {
                  text: "thanks again, help",
                  chat: { id: "123" },
                  from: { id: "777" },
                },
              },
            ],
          };
        },
        async text() {
          return "";
        },
      };
    }
    if (/sendMessage/i.test(asString)) {
      sentMessages.push(JSON.parse(String(initReq?.body || "{}")));
      return {
        ok: true,
        async json() {
          return { ok: true };
        },
        async text() {
          return "";
        },
      };
    }
    throw new Error(`Unexpected URL ${asString}`);
  };

  const report = await runChannelRuntimeTick(rootDir, "telegram", { fetchImpl: fakeFetch, autoReply: true });
  assert.equal(report.ok, true);
  assert.equal(report.processed, 2);
  assert.equal(sentMessages.length, 2);
  assert.match(String(sentMessages[0].text), /Priority support response to 777/);
  assert.match(String(sentMessages[1].text), /Good to hear from you again\./);

  const routingPath = path.join(rootDir, "memory", "channels", "telegram", "routing.jsonl");
  const routing = await fs.readFile(routingPath, "utf-8");
  assert.match(routing, /priority_help/i);
  const socialPath = path.join(rootDir, "brain", "social_memory.json");
  const social = JSON.parse(await fs.readFile(socialPath, "utf-8"));
  assert.equal(social.users["telegram:777"].interactions >= 2, true);

  await fs.rm(testHome, { recursive: true, force: true });
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

test("channel run whatsapp processes inbound webhook queue", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-channel-runtime-whatsapp");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    WHATSAPP_ACCESS_TOKEN: "token",
    WHATSAPP_PHONE_NUMBER_ID: "phone-id",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "channel-runtime-whatsapp-seed",
      "--purpose",
      "Validate whatsapp channel runtime",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const bootstrap = spawnSync("node", ["dist/cli.js", "channel", "bootstrap", "whatsapp"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(bootstrap.status, 0, `${bootstrap.stdout}\n${bootstrap.stderr}`);

  const rootDir = path.join(testHome, ".hatchlings", "channel-runtime-whatsapp-seed");
  const webhookPath = path.join(rootDir, "memory", "channels", "whatsapp", "inbound_webhooks.jsonl");
  await fs.mkdir(path.dirname(webhookPath), { recursive: true });
  await fs.writeFile(
    webhookPath,
    `${JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.abc123",
                    from: "15555550000",
                    text: { body: "hello from whatsapp" },
                  },
                ],
              },
            },
          ],
        },
      ],
    })}\n`,
    "utf-8",
  );

  const run = spawnSync("node", ["dist/cli.js", "channel", "run", "whatsapp", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.processed, 1);

  const inboxPath = path.join(rootDir, "memory", "channels", "whatsapp", "inbox.jsonl");
  const inbox = await fs.readFile(inboxPath, "utf-8");
  assert.match(inbox, /hello from whatsapp/i);

  await fs.rm(testHome, { recursive: true, force: true });
});

test("telegram runtime multi-turn planner adds follow-up question for ambiguous default requests", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-channel-runtime-telegram-dialog");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    HATCHLING_REFLEX_CHECK: "0",
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_CHAT_ID: "123",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "channel-runtime-telegram-dialog-seed",
      "--purpose",
      "Validate telegram dialog planning",
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
  process.env.HATCHLING_REFLEX_CHECK = "0";

  const rootDir = path.join(testHome, ".hatchlings", "channel-runtime-telegram-dialog-seed");
  const policyPath = path.join(rootDir, "brain", "channel_policy.json");
  const policy = JSON.parse(await fs.readFile(policyPath, "utf-8"));
  policy.telegram.routes = [];
  policy.telegram.defaultResponseTemplate = "Acknowledged: {{text}}";
  await fs.writeFile(policyPath, JSON.stringify(policy, null, 2), "utf-8");

  const { runChannelRuntimeTick } = await import("../dist/system/channel-runtime.js");
  const sentMessages = [];
  const fakeFetch = async (url, initReq) => {
    const asString = String(url);
    if (/getUpdates/i.test(asString)) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            result: [
              {
                update_id: 9201,
                message: {
                  text: "help",
                  chat: { id: "123" },
                  from: { id: "999" },
                },
              },
            ],
          };
        },
        async text() {
          return "";
        },
      };
    }
    if (/sendMessage/i.test(asString)) {
      sentMessages.push(JSON.parse(String(initReq?.body || "{}")));
      return {
        ok: true,
        async json() {
          return { ok: true };
        },
        async text() {
          return "";
        },
      };
    }
    throw new Error(`Unexpected URL ${asString}`);
  };

  const report = await runChannelRuntimeTick(rootDir, "telegram", { fetchImpl: fakeFetch, autoReply: true });
  assert.equal(report.ok, true);
  assert.equal(report.processed, 1);
  assert.equal(sentMessages.length, 1);
  assert.match(String(sentMessages[0].text), /exact outcome you want next/i);

  const dialogPath = path.join(rootDir, "brain", "dialog_state.json");
  const dialog = JSON.parse(await fs.readFile(dialogPath, "utf-8"));
  assert.equal(typeof dialog.sessions["telegram:999"], "object");
  assert.match(String(dialog.sessions["telegram:999"].openQuestion), /exact outcome/i);

  await fs.rm(testHome, { recursive: true, force: true });
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

test("whatsapp webhook ingress helpers verify challenge and write inbound payload", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-channel-runtime-whatsapp-webhook");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  const env = {
    ...process.env,
    HATCHLING_HOME: testHome,
    HATCHLING_HINDBRAIN_BACKEND: "cpu",
    WHATSAPP_ACCESS_TOKEN: "token",
    WHATSAPP_PHONE_NUMBER_ID: "phone-id",
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify-me",
  };
  const init = spawnSync(
    "node",
    [
      "dist/cli.js",
      "init",
      "--non-interactive",
      "--name",
      "channel-runtime-whatsapp-webhook-seed",
      "--purpose",
      "Validate whatsapp webhook ingress runtime",
      "--personality",
      "curious,direct",
    ],
    { cwd: process.cwd(), env, encoding: "utf-8" },
  );
  assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);

  const bootstrap = spawnSync("node", ["dist/cli.js", "channel", "bootstrap", "whatsapp"], {
    cwd: process.cwd(),
    env,
    encoding: "utf-8",
  });
  assert.equal(bootstrap.status, 0, `${bootstrap.stdout}\n${bootstrap.stderr}`);

  const rootDir = path.join(testHome, ".hatchlings", "channel-runtime-whatsapp-webhook-seed");
  const {
    ingestWhatsAppWebhookPayload,
    runChannelRuntimeTick,
    validateWhatsAppWebhookChallenge,
  } = await import("../dist/system/channel-runtime.js");
  process.env.WHATSAPP_ACCESS_TOKEN = "token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id";

  try {
    const challenge = validateWhatsAppWebhookChallenge(
      new URLSearchParams("hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"),
      "verify-me",
    );
    assert.equal(challenge.ok, true);
    assert.equal(challenge.statusCode, 200);
    assert.equal(challenge.challenge, "12345");

    const payload = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.ingress123",
                    from: "15555550123",
                    text: { body: "hello from webhook ingress" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    await ingestWhatsAppWebhookPayload(rootDir, JSON.stringify(payload));

    const report = await runChannelRuntimeTick(rootDir, "whatsapp", { autoReply: false });
    assert.equal(report.ok, true);
    assert.equal(report.processed, 1);

    const inboxPath = path.join(rootDir, "memory", "channels", "whatsapp", "inbox.jsonl");
    const inbox = await fs.readFile(inboxPath, "utf-8");
    assert.match(inbox, /hello from webhook ingress/i);
  } finally {
    await fs.rm(testHome, { recursive: true, force: true });
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  }
});
