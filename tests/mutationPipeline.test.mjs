import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

async function setupInstance() {
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-mutation-pipeline-"));
  await fs.mkdir(path.join(tmpRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  await fs.copyFile(path.join(process.cwd(), "tsconfig.json"), path.join(tmpRoot, "tsconfig.json"));
  await fs.copyFile(path.join(process.cwd(), "package.json"), path.join(tmpRoot, "package.json"));
  await fs.writeFile(path.join(tmpRoot, "src", "sample.ts"), "export const sample = 1;", "utf-8");
  execSync("git init", { cwd: tmpRoot, stdio: "ignore" });
  execSync('git config user.name "Hatchling Test"', { cwd: tmpRoot, stdio: "ignore" });
  execSync('git config user.email "hatchling@test"', { cwd: tmpRoot, stdio: "ignore" });
  execSync("git add .", { cwd: tmpRoot, stdio: "ignore" });
  execSync('git commit -m "init"', { cwd: tmpRoot, stdio: "ignore" });
  return tmpRoot;
}

test("valid proposal passes immune validation and reaches staging", async () => {
  const { runMutationPipeline } = await import("../dist/mutation/mutation_pipeline.js");
  const tmpRoot = await setupInstance();
  process.env.HATCHLING_CONSTITUTION_CHECK = "0";

  const result = await runMutationPipeline(tmpRoot, {
    filePath: "system/pipeline.ts",
    content: "export const pipeline = true;",
    approved: true,
  });

  delete process.env.HATCHLING_CONSTITUTION_CHECK;
  assert.equal(result.status, "committed");
  assert.equal(result.stage, "finalize");
  assert.ok(result.allow?.allowed);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("denied proposal stops before staging", async () => {
  const { runMutationPipeline } = await import("../dist/mutation/mutation_pipeline.js");
  const tmpRoot = await setupInstance();
  process.env.HATCHLING_IMMUNE_FORCE_DENY = "1";
  process.env.HATCHLING_CONSTITUTION_CHECK = "0";

  const result = await runMutationPipeline(tmpRoot, {
    filePath: "system/deny.ts",
    content: "export const deny = true;",
    approved: true,
  });

  delete process.env.HATCHLING_IMMUNE_FORCE_DENY;
  delete process.env.HATCHLING_CONSTITUTION_CHECK;
  assert.equal(result.status, "denied");
  assert.equal(result.stage, "immune");
  assert.equal(existsSync(path.join(tmpRoot, ".mutation_staging", result.proposalId)), false);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("failed test triggers rollback", async () => {
  const { runMutationPipeline } = await import("../dist/mutation/mutation_pipeline.js");
  const tmpRoot = await setupInstance();
  process.env.HATCHLING_CONSTITUTION_CHECK = "0";

  const result = await runMutationPipeline(tmpRoot, {
    filePath: "system/bad.ts",
    content: "export const bad = ;",
    approved: true,
  });

  delete process.env.HATCHLING_CONSTITUTION_CHECK;
  assert.equal(result.status, "failed");
  assert.equal(result.stage, "testing");
  assert.equal(existsSync(path.join(tmpRoot, "src", "system", "bad.ts")), false);
  assert.equal(existsSync(path.join(tmpRoot, ".mutation_staging", result.proposalId)), false);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("successful pipeline run commits cleanly", async () => {
  const { runMutationPipeline } = await import("../dist/mutation/mutation_pipeline.js");
  const tmpRoot = await setupInstance();
  process.env.HATCHLING_CONSTITUTION_CHECK = "0";

  const result = await runMutationPipeline(tmpRoot, {
    filePath: "system/good.ts",
    content: "export const good = true;",
    approved: true,
  });

  delete process.env.HATCHLING_CONSTITUTION_CHECK;
  assert.equal(result.status, "committed");
  assert.ok(result.commitHash);
  const message = execSync("git log -1 --pretty=%B", { cwd: tmpRoot }).toString();
  assert.match(message, /Mutation: src\/system\/good\.ts/);
  await fs.rm(tmpRoot, { recursive: true, force: true });
});
