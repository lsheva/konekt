import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWalletRedirect } from "../src/index.ts";
import { shouldRedirect } from "../src/kernel/redirect.ts";

test("wallet redirect appends requestId and sessionTopic", () => {
  assert.equal(
    formatWalletRedirect("https://wallet.example/app/", 42, "abc"),
    "https://wallet.example/app/wc?requestId=42&sessionTopic=abc",
  );
});

test("telegram startapp encodes the payload", () => {
  const url = formatWalletRedirect("https://t.me/mybot", 7, "topic");
  assert.match(url, /^https:\/\/t\.me\/mybot\?startapp=/);
  const encoded = url.split("startapp=")[1]!;
  const payload = Buffer.from(encoded, "base64url").toString();
  assert.equal(payload, "requestId=7&sessionTopic=topic");
});

test("redirect url is omitted without a href or when the wallet disables deep links", () => {
  assert.equal(shouldRedirect(false, "https://w.example"), true);
  assert.equal(shouldRedirect(true, "https://w.example"), false);
  assert.equal(shouldRedirect(false, undefined), false);
});
