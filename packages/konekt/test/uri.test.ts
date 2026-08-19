import assert from "node:assert/strict";
import { test } from "node:test";
import { formatUri, parseUri } from "../src/kernel/uri.ts";

const TOPIC = "c9e6d30fb34afe70a15c14e9337ba8e4d5a35dd695c39b94884b0ee60c69d168";
const SYM = "0653ca620c7b4990392e1c53c4a51c14a2840cd20f0f1524cf435b17b6fe988c";

test("formatUri matches @walletconnect/utils without expiry", async () => {
  const { formatUri: wc } = await import("@walletconnect/utils");
  const params = { protocol: "wc" as const, version: 2, topic: TOPIC, symKey: SYM, relay: { protocol: "irn" } };
  assert.equal(formatUri(params), wc(params));
  assert.equal(formatUri(params), `wc:${TOPIC}@2?relay-protocol=irn&symKey=${SYM}`);
});

test("parseUri round-trips expiry and topic", () => {
  const uri = formatUri({
    protocol: "wc",
    version: 2,
    topic: TOPIC,
    symKey: SYM,
    relay: { protocol: "irn" },
    expiryTimestamp: 1700000000,
  });
  const parsed = parseUri(uri);
  assert.equal(parsed.topic, TOPIC);
  assert.equal(parsed.symKey, SYM);
  assert.equal(parsed.expiryTimestamp, 1700000000);
  assert.equal(parseUri(`wc://${TOPIC}@2?symKey=${SYM}&relay-protocol=irn`).topic, TOPIC);
});
