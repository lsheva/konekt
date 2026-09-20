import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExplorerWallet } from "../src/explorer.ts";
import { formatWalletLink, walletHref, walletLink } from "../src/link.ts";

const wallet: ExplorerWallet = {
  id: "mm",
  name: "MetaMask",
  rdns: "io.metamask",
  imageUrl: "",
  mobile: { native: "metamask://", universal: "https://metamask.app.link" },
  desktop: { native: "", universal: "" },
};

test("formatWalletLink appends wc?uri= for native schemes", () => {
  const href = formatWalletLink("metamask://", "wc:abc");
  assert.equal(href, `metamask://wc?uri=${encodeURIComponent("wc:abc")}`);
});

test("formatWalletLink appends wc?uri= for https universal links", () => {
  const href = formatWalletLink("https://metamask.app.link", "wc:abc");
  assert.equal(href, `https://metamask.app.link/wc?uri=${encodeURIComponent("wc:abc")}`);
});

test("formatWalletLink adds a scheme when the listing omitted one", () => {
  assert.equal(formatWalletLink("rainbow", "wc:x"), `rainbow://wc?uri=${encodeURIComponent("wc:x")}`);
});

test("walletHref prefers the native scheme of the requested platform", () => {
  assert.equal(walletHref(wallet, "wc:abc", true), `metamask://wc?uri=${encodeURIComponent("wc:abc")}`);
});

test("walletHref does not reach the other platform for a link", () => {
  assert.equal(walletHref(wallet, "wc:abc", false), undefined);
});

test("walletLink falls back from native to universal within one platform", () => {
  const universalOnly: ExplorerWallet = { ...wallet, mobile: { native: "", universal: "https://rainbow.me" } };
  assert.equal(walletLink(universalOnly, true), "https://rainbow.me");
});

test("walletLink reports nothing for a platform the wallet skipped", () => {
  assert.equal(walletLink(wallet, false), undefined);
});
