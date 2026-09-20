import assert from "node:assert/strict";
import { test } from "node:test";
import { pairingExpiry, pairingRefreshDelay } from "../src/pairing.ts";

const uri = (query: string) => `wc:9b1f@2?${query}`;

test("pairingExpiry reads the deadline the provider stamped into the URI", () => {
  assert.equal(pairingExpiry(uri("expiryTimestamp=1735689600&relay-protocol=irn&symKey=ab")), 1735689600);
});

test("pairingExpiry reports nothing for a URI without a deadline", () => {
  assert.equal(pairingExpiry(uri("relay-protocol=irn&symKey=ab")), undefined);
});

test("pairingExpiry reports nothing for an unreadable deadline", () => {
  assert.equal(pairingExpiry(uri("expiryTimestamp=soon")), undefined);
});

test("pairingExpiry reports nothing for a URI without a query", () => {
  assert.equal(pairingExpiry("wc:9b1f@2"), undefined);
});

test("pairingRefreshDelay leaves a margin before the deadline", () => {
  const now = 1_735_689_600_000;
  assert.equal(pairingRefreshDelay(uri("expiryTimestamp=1735689900"), now), 300_000 - 20_000);
});

test("pairingRefreshDelay is spent once the margin is all that is left", () => {
  const now = 1_735_689_600_000;
  assert.equal(pairingRefreshDelay(uri("expiryTimestamp=1735689610"), now), 0);
  assert.equal(pairingRefreshDelay(uri("expiryTimestamp=1735689000"), now), 0);
});

test("pairingRefreshDelay reports nothing for a URI with no deadline to work from", () => {
  assert.equal(pairingRefreshDelay(uri("symKey=ab")), undefined);
});
