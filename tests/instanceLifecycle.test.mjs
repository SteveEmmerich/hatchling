import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("instance lifecycle creates, activates, lists, and deletes", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  process.env.HATCHLING_HOME = testHome;
  const instance = await import("../dist/system/instance.js");

  const instancePath = await instance.createInstance({
    name: "specimen",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });

  const configPath = path.join(instancePath, "brain", "config.json");
  const configRaw = await fs.readFile(configPath, "utf-8");
  const config = JSON.parse(configRaw);
  assert.equal(config.name, "specimen");
  assert.equal(config.provider, "hindbrain");

  await instance.setActiveInstance("specimen");
  const active = await instance.getActiveInstance();
  assert.equal(active, "specimen");

  const list = await instance.listInstances();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "specimen");

  await instance.deleteInstance("specimen");
  await assert.rejects(
    () => fs.access(instancePath),
    /ENOENT/,
  );

  await fs.rm(testHome, { recursive: true, force: true });
});
