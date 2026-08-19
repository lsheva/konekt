import assert from "node:assert/strict";
import { test } from "node:test";
import { createDedupe } from "../src/kernel/dedupe.ts";

test("duplicated inbound keys are accepted once", () => {
  const accept = createDedupe(2);
  assert.equal(accept("a"), true);
  assert.equal(accept("a"), false);
  assert.equal(accept("b"), true);
  assert.equal(accept("c"), true);
  assert.equal(accept("a"), true);
});
