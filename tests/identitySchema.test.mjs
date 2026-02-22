import test from "node:test";
import assert from "node:assert/strict";

import { safeParseIdentity } from "../dist/system/identity-schema.js";

test("identity schema accepts valid discovery payload", () => {
  const result = safeParseIdentity({
    name: "lumin",
    purpose: "Assist with software development",
    personality: ["curious", "loyal"],
  });
  assert.equal(result.success, true);
});

test("identity schema rejects missing personality", () => {
  const result = safeParseIdentity({
    name: "lumin",
    purpose: "Assist with software development",
    personality: [],
  });
  assert.equal(result.success, false);
});
