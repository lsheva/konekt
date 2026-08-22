/**
 * App side of the Wallet Standard announce protocol.
 *
 * Extensions such as Phantom, Solflare, and Backpack register themselves through window events:
 * a wallet dispatches `wallet-standard:register-wallet` with a callback that receives the app's
 * `register` function, and listens for `wallet-standard:app-ready` to catch apps that started
 * first. This module keeps the registry; the hook in `index.ts` renders it.
 */

/** An account a Wallet Standard wallet exposed after `standard:connect`. */
export type WalletStandardAccount = {
  address: string;
  publicKey: Uint8Array;
  chains: readonly string[];
  features: readonly string[];
};

/** A wallet announced through the Wallet Standard window events. */
export type WalletStandardWallet = {
  version: string;
  name: string;
  /** Data URI, safe to use as an `img` source. */
  icon: string;
  /** Wallet Standard chain ids, e.g. `"solana:mainnet"`. */
  chains: readonly string[];
  features: Readonly<Record<string, unknown>>;
  accounts: readonly WalletStandardAccount[];
};

type ConnectFeature = {
  connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletStandardAccount[] }>;
};

type RegisterApi = { register: (...wallets: WalletStandardWallet[]) => () => void };

const APP_READY = "wallet-standard:app-ready";
const REGISTER_WALLET = "wallet-standard:register-wallet";
const SOLANA_NAMESPACE = "solana:";

const registry = new Set<WalletStandardWallet>();
const listeners = new Set<() => void>();
let snapshot: readonly WalletStandardWallet[] = [];
let started = false;

function publish() {
  snapshot = [...registry];
  for (const notify of listeners) notify();
}

function register(...wallets: WalletStandardWallet[]): () => void {
  for (const wallet of wallets) registry.add(wallet);
  publish();
  return () => {
    for (const wallet of wallets) registry.delete(wallet);
    publish();
  };
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const api: RegisterApi = { register };
  window.addEventListener(REGISTER_WALLET, (event) => {
    const callback = (event as CustomEvent<(api: RegisterApi) => void>).detail;
    if (typeof callback === "function") callback(api);
  });
  window.dispatchEvent(new CustomEvent(APP_READY, { detail: api }));
}

/** Starts listening for wallet announcements and subscribes to registry changes. */
export function subscribeWallets(notify: () => void): () => void {
  start();
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

/** The announced wallets. Referentially stable between registrations. */
export function walletsSnapshot(): readonly WalletStandardWallet[] {
  return snapshot;
}

/**
 * Whether the wallet serves the requested chains.
 *
 * With no `chains`, any `solana:` chain qualifies: this subpath exists for Solana, and the default
 * keeps EVM-only Wallet Standard wallets out of the list.
 */
export function supportsChains(wallet: WalletStandardWallet, chains?: readonly string[]): boolean {
  if (chains?.length) return wallet.chains.some((chain) => chains.includes(chain));
  return wallet.chains.some((chain) => chain.startsWith(SOLANA_NAMESPACE));
}

/** Runs the wallet's `standard:connect` feature. */
export async function connectWallet(
  wallet: WalletStandardWallet,
): Promise<{ accounts: readonly WalletStandardAccount[] }> {
  const feature = wallet.features["standard:connect"] as ConnectFeature | undefined;
  if (typeof feature?.connect !== "function") {
    throw new Error(`${wallet.name} does not offer standard:connect.`);
  }
  return feature.connect();
}
