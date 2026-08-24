import assert from "node:assert/strict";
import { test } from "node:test";
import { avatarGradient, truncateAddress } from "../src/address.ts";

test("truncateAddress keeps the first six and last four characters", () => {
  assert.equal(truncateAddress("0x1234567890abcdef1234567890abcdef12345678"), "0x1234…5678");
});

test("avatarGradient is stable for a given address", () => {
  const address = "0x1234567890abcdef1234567890abcdef12345678";
  assert.equal(avatarGradient(address), avatarGradient(address));
  assert.match(avatarGradient(address), /^radial-gradient\(.+\), linear-gradient\(.+\)$/);
});
