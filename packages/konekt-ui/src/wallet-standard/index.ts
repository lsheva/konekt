import { useMemo, useState, useSyncExternalStore } from "react";
import type { LocalWalletSource } from "../providerPairing.ts";
import type { LocalWallet } from "../WalletModal.tsx";
import {
  connectWallet,
  subscribeWallets,
  supportsChains,
  type WalletStandardWallet,
  walletsSnapshot,
} from "./registry.ts";

export type { WalletStandardAccount, WalletStandardWallet } from "./registry.ts";

const SERVER_WALLETS: readonly WalletStandardWallet[] = [];
const serverSnapshot = () => SERVER_WALLETS;

/** Options for {@link useWalletStandardSource}. */
export type WalletStandardSourceOptions = {
  /**
   * Wallet Standard chain ids a wallet must serve, e.g. `["solana:mainnet"]`. Defaults to any
   * `solana:` chain. These are not konekt CAIP-2 ids; Wallet Standard names Solana networks, it
   * does not use genesis hashes.
   */
  chains?: readonly string[] | undefined;
  /**
   * Receives the connected wallet. Keep the handle: signing goes through its features
   * (`solana:signMessage`, `solana:signTransaction`), never through the modal or the konekt
   * provider.
   */
  onConnect: (wallet: WalletStandardWallet) => void;
  /** Receives connect failures, e.g. the user dismissing the extension prompt. */
  onError?: ((error: Error) => void) | undefined;
};

function walletId(wallet: WalletStandardWallet): string {
  return `wallet-standard:${wallet.name}`;
}

function toLocalWallet(wallet: WalletStandardWallet): LocalWallet {
  return { id: walletId(wallet), name: wallet.name, icon: wallet.icon };
}

/**
 * Discovers injected Solana wallets for {@link useProviderPairing}'s `sources`.
 *
 * Solana extensions announce themselves through the Wallet Standard window events; this hook
 * lists the announcements and connects the one the user picks. It is discovery only: after
 * `onConnect` the app owns the wallet handle, its accounts, and its lifecycle.
 */
export function useWalletStandardSource({
  chains,
  onConnect,
  onError,
}: WalletStandardSourceOptions): LocalWalletSource {
  const announced = useSyncExternalStore(subscribeWallets, walletsSnapshot, serverSnapshot);
  const [connectedId, setConnectedId] = useState<string>();

  const chainKey = chains?.join(",") ?? "";
  const matching = useMemo(() => {
    const filter = chainKey ? chainKey.split(",") : undefined;
    return announced.filter((wallet) => supportsChains(wallet, filter));
  }, [announced, chainKey]);
  const wallets = useMemo(() => matching.map(toLocalWallet), [matching]);

  const connect = (wallet: LocalWallet) => {
    const target = matching.find((candidate) => walletId(candidate) === wallet.id);
    if (!target) return;
    void connectWallet(target)
      .then(() => {
        setConnectedId(wallet.id);
        onConnect(target);
      })
      .catch((e: unknown) => onError?.(e instanceof Error ? e : new Error(String(e))));
  };

  return { wallets, connect, connected: connectedId !== undefined };
}
