import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("maintenance tick triggers auto-sleep once within cooldown", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-maintenance");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  process.env.HATCHLING_HOME = testHome;
  process.env.HATCHLING_INTERNAL_WRITE = "1";

  const instance = await import("../dist/system/instance.js");
  const { generateDNAFiles } = await import("../dist/system/dna-generator.js");
  const { runMaintenanceTick } = await import("../dist/system/maintenance.js");

  const rootDir = await instance.createInstance({
    name: "maint",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });
  await generateDNAFiles(path.join(rootDir, "brain"), {
    name: "maint",
    purpose: "Validate maintenance behavior",
    personality: ["steady"],
  });

  let sleeps = 0;
  const firstNow = new Date("2026-02-22T09:00:00.000Z");
  const first = await runMaintenanceTick(rootDir, {
    now: () => firstNow,
    checkDiskUsage: async () => {},
    isLowEnergy: async () => true,
    sleepFn: async () => {
      sleeps += 1;
    },
    sleepCooldownMinutes: 180,
  });
  assert.equal(first.autoSleepTriggered, true);
  assert.equal(sleeps, 1);

  const second = await runMaintenanceTick(rootDir, {
    now: () => new Date("2026-02-22T09:10:00.000Z"),
    checkDiskUsage: async () => {},
    isLowEnergy: async () => true,
    sleepFn: async () => {
      sleeps += 1;
    },
    sleepCooldownMinutes: 180,
  });
  assert.equal(second.autoSleepTriggered, false);
  assert.equal(sleeps, 1);

  await instance.deleteInstance("maint");
  await fs.rm(testHome, { recursive: true, force: true });
});

test("maintenance tick compacts telemetry and staging waste", async () => {
  const testHome = path.join(process.cwd(), ".tmp-test-home-maintenance-compact");
  await fs.rm(testHome, { recursive: true, force: true });
  await fs.mkdir(testHome, { recursive: true });

  process.env.HATCHLING_HOME = testHome;
  process.env.HATCHLING_INTERNAL_WRITE = "1";

  const instance = await import("../dist/system/instance.js");
  const { generateDNAFiles } = await import("../dist/system/dna-generator.js");
  const { runMaintenanceTick } = await import("../dist/system/maintenance.js");

  const rootDir = await instance.createInstance({
    name: "compact",
    provider: "hindbrain",
    model: "hindbrain-1b",
  });
  await generateDNAFiles(path.join(rootDir, "brain"), {
    name: "compact",
    purpose: "Validate waste compaction",
    personality: ["efficient"],
  });

  const telemetryDir = path.join(rootDir, "memory", "telemetry");
  await fs.mkdir(telemetryDir, { recursive: true });
  await fs.writeFile(path.join(telemetryDir, "2026-02-18.jsonl"), '{"type":"info"}\n', "utf-8");
  await fs.writeFile(path.join(telemetryDir, "2026-02-19.jsonl"), '{"type":"info"}\n', "utf-8");
  await fs.writeFile(path.join(telemetryDir, "2026-02-20.jsonl"), '{"type":"info"}\n', "utf-8");

  const stagingPath = path.join(rootDir, "memory", "STAGING_MEMORY.md");
  await fs.writeFile(stagingPath, "x".repeat(100), "utf-8");

  const report = await runMaintenanceTick(rootDir, {
    now: () => new Date("2026-02-22T10:00:00.000Z"),
    checkDiskUsage: async () => {},
    isLowEnergy: async () => false,
    telemetryKeepFiles: 2,
    stagingMaxChars: 32,
  });
  assert.equal(report.telemetryPruned, 1);
  assert.equal(report.stagingTrimmed, true);

  const remaining = (await fs.readdir(telemetryDir)).filter((name) => name.endsWith(".jsonl"));
  assert.equal(remaining.includes("2026-02-18.jsonl"), false);
  assert.equal(remaining.length <= 3, true);
  const stagingContent = await fs.readFile(stagingPath, "utf-8");
  assert.equal(stagingContent.length, 32);

  await instance.deleteInstance("compact");
  await fs.rm(testHome, { recursive: true, force: true });
});
