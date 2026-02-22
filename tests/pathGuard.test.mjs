import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { PathGuard } from "../dist/system/pathGuard.js";

test("PathGuard allows paths inside root", async () => {
  const root = process.cwd();
  PathGuard.setRoot(root);
  const allowed = await PathGuard.validatePath("brain/config.json", "read");
  assert.equal(allowed, path.resolve(root, "brain/config.json"));
});

test("PathGuard blocks traversal outside root", async () => {
  const root = process.cwd();
  PathGuard.setRoot(root);
  await assert.rejects(
    () => PathGuard.validatePath("../../etc/passwd", "read"),
    /outside territory/i,
  );
});
