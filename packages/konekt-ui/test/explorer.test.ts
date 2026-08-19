import assert from "node:assert/strict";
import { test } from "node:test";
import { type ExplorerWallet, filterWallets, parseListings, parseWallet } from "../src/explorer.ts";

function wallet(id: string): ExplorerWallet {
  const links = { native: "", universal: "" };
  return { id, name: id, rdns: "", imageUrl: "", mobile: links, desktop: links };
}

const listed = [wallet("mm"), wallet("rainbow"), wallet("phantom")];
const ids = (wallets: readonly ExplorerWallet[]) => wallets.map((w) => w.id);

test("parseWallet reads explorer listing fields", () => {
  const wallet = parseWallet({
    id: "mm",
    name: "MetaMask",
    rdns: "io.metamask",
    image_url: { sm: "s", md: "m", lg: "l" },
    mobile: { native: "metamask://", universal: "https://metamask.app.link" },
    desktop: { native: "", universal: null },
  });
  assert.deepEqual(wallet, {
    id: "mm",
    name: "MetaMask",
    rdns: "io.metamask",
    imageUrl: "m",
    mobile: { native: "metamask://", universal: "https://metamask.app.link" },
    desktop: { native: "", universal: "" },
  });
});

test("parseListings flattens the listings map", () => {
  const { wallets, total } = parseListings({
    count: 1,
    total: 631,
    listings: {
      mm: { id: "mm", name: "MetaMask", image_url: { md: "m" }, mobile: {}, desktop: {} },
    },
  });
  assert.equal(total, 631);
  assert.equal(wallets.length, 1);
  assert.equal(wallets[0]?.name, "MetaMask");
});

test("parseListings is empty on junk", () => {
  assert.deepEqual(parseListings(null), { wallets: [], total: 0 });
  assert.equal(parseWallet("x"), undefined);
});

test("filterWallets keeps every wallet without a filter", () => {
  assert.deepEqual(ids(filterWallets(listed)), ["mm", "rainbow", "phantom"]);
  assert.deepEqual(ids(filterWallets(listed, { include: [], exclude: [] })), ["mm", "rainbow", "phantom"]);
});

test("filterWallets lists only the included ids", () => {
  assert.deepEqual(ids(filterWallets(listed, { include: ["phantom", "mm"] })), ["mm", "phantom"]);
});

test("filterWallets drops excluded ids, include or not", () => {
  assert.deepEqual(ids(filterWallets(listed, { exclude: ["rainbow"] })), ["mm", "phantom"]);
  assert.deepEqual(ids(filterWallets(listed, { include: ["mm", "rainbow"], exclude: ["rainbow"] })), ["mm"]);
});
