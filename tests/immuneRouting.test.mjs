import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

test("mutation proposals route through immune subsystem", async () => {
  const { mutate } = await import("../dist/organism/evolution.js");
  const tmpRoot = await fs.mkdtemp(path.join(process.cwd(), ".tmp-test-immune-mutation-"));
  await fs.mkdir(path.join(tmpRoot, "brain"), { recursive: true });
  process.env.HATCHLING_IMMUNE_FORCE_DENY = "1";
  process.env.HATCHLING_CONSTITUTION_CHECK = "0";

  const result = await mutate(tmpRoot, "system/immune-routing.ts", "export const ok = true;", false);

  delete process.env.HATCHLING_IMMUNE_FORCE_DENY;
  delete process.env.HATCHLING_CONSTITUTION_CHECK;
  assert.equal(result.success, false);
  assert.match(result.message, /Immune validation failed/i);
  assert.ok(result.errors && result.errors.some((err) => /Immune override/.test(err)));
  await fs.rm(tmpRoot, { recursive: true, force: true });
});
