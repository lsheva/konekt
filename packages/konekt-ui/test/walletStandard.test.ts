import assert from "node:assert/strict";
import { test } from "node:test";
import {
  connectWallet,
  subscribeWallets,
  supportsChains,
  type WalletStandardWallet,
  walletsSnapshot,
} from "../src/wallet-standard/registry.ts";

/** Node has EventTarget and CustomEvent, so a bare target stands in for the browser window. */
const fakeWindow = new EventTarget();
(globalThis as unknown as { window: EventTarget }).window = fakeWindow;

type RegisterApi = { register: (...wallets: WalletStandardWallet[]) => () => void };

function wallet(name: string, chains: readonly string[], features: Record<string, unknown> = {}): WalletStandardWallet {
  return { version: "1.0.0", name, icon: "data:image/svg+xml;base64,", chains, features, accounts: [] };
}

test("a wallet listening for app-ready lands in the snapshot", () => {
  const phantom = wallet("Phantom", ["solana:mainnet", "solana:devnet"]);
  fakeWindow.addEventListener("wallet-standard:app-ready", (event) => {
    (event as CustomEvent<RegisterApi>).detail.register(phantom);
  });

  const unsubscribe = subscribeWallets(() => {});

  assert.deepEqual(walletsSnapshot(), [phantom]);
  unsubscribe();
});

test("a wallet announcing register-wallet after the app started lands in the snapshot", () => {
  const solflare = wallet("Solflare", ["solana:mainnet"]);
  const unsubscribe = subscribeWallets(() => {});

  fakeWindow.dispatchEvent(
    new CustomEvent("wallet-standard:register-wallet", {
      detail: (api: RegisterApi) => api.register(solflare),
    }),
  );

  assert.ok(walletsSnapshot().includes(solflare));
  unsubscribe();
});

test("registering returns an unregister that removes the wallet and notifies", () => {
  let notified = 0;
  const unsubscribe = subscribeWallets(() => {
    notified += 1;
  });
  const ghost = wallet("Ghost", ["solana:mainnet"]);
  let unregister = () => {};
  fakeWindow.dispatchEvent(
    new CustomEvent("wallet-standard:register-wallet", {
      detail: (api: RegisterApi) => {
        unregister = api.register(ghost);
      },
    }),
  );
  assert.ok(walletsSnapshot().includes(ghost));

  const before = notified;
  unregister();
  assert.ok(!walletsSnapshot().includes(ghost));
  assert.equal(notified, before + 1);
  unsubscribe();
});

test("supportsChains defaults to the solana namespace", () => {
  assert.ok(supportsChains(wallet("Phantom", ["solana:mainnet", "eip155:1"])));
  assert.ok(!supportsChains(wallet("Rabby", ["eip155:1"])));
});

test("supportsChains with explicit ids requires one of them", () => {
  const w = wallet("Phantom", ["solana:mainnet"]);
  assert.ok(supportsChains(w, ["solana:mainnet"]));
  assert.ok(!supportsChains(w, ["solana:devnet"]));
});

test("connectWallet runs the standard:connect feature", async () => {
  let called = false;
  const w = wallet("Phantom", ["solana:mainnet"], {
    "standard:connect": {
      connect: () => {
        called = true;
        return Promise.resolve({ accounts: [] });
      },
    },
  });
  await connectWallet(w);
  assert.ok(called);
});

test("connectWallet rejects when the feature is missing", async () => {
  await assert.rejects(connectWallet(wallet("Bare", ["solana:mainnet"])), /standard:connect/);
});
