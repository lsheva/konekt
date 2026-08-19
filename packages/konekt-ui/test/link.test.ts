import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExplorerWallet } from "../src/explorer.ts";
import { formatWalletLink, walletHref } from "../src/link.ts";

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

test("walletHref prefers mobile native then universal", () => {
  assert.equal(walletHref(wallet, "wc:abc", true), `metamask://wc?uri=${encodeURIComponent("wc:abc")}`);
  assert.equal(walletHref(wallet, "wc:abc", false), `metamask://wc?uri=${encodeURIComponent("wc:abc")}`);
});
