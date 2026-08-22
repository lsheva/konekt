import { useEffect, useState } from "react";
import type { LocalWalletSource } from "../providerPairing.ts";
import type { LocalWallet } from "../WalletModal.tsx";

/**
 * The Keplr-API surface this source needs. The connected handle usually offers much more
 * (offline signers, key queries); cast it to your own Keplr types after `onConnect`.
 */
export type CosmosInjectedWallet = {
  enable: (chainIds: string | string[]) => Promise<void>;
};

/**
 * Cosmos has no announce protocol like EIP-6963 or the Wallet Standard, so discovery is probing
 * well-known window keys. Every probed extension exposes the Keplr API shape.
 */
const PROBES = [
  { key: "keplr", name: "Keplr" },
  { key: "leap", name: "Leap" },
] as const;

const NO_WALLETS: readonly LocalWallet[] = [];

function injectedAt(key: string): CosmosInjectedWallet | undefined {
  const candidate = (window as unknown as Record<string, unknown>)[key] as CosmosInjectedWallet | undefined;
  return typeof candidate?.enable === "function" ? candidate : undefined;
}

/** Probes the window for Keplr-API wallets. Exported for apps that want the list without the hook. */
export function detectCosmosWallets(): readonly LocalWallet[] {
  if (typeof window === "undefined") return NO_WALLETS;
  return PROBES.filter((probe) => injectedAt(probe.key)).map((probe) => ({
    id: `cosmos:${probe.key}`,
    name: probe.name,
  }));
}

/** Options for {@link useCosmosSource}. */
export type CosmosSourceOptions = {
  /** Cosmos chain ids passed to `enable`, e.g. `["cosmoshub-4"]`. */
  chainIds: readonly string[];
  /** Receives the enabled wallet. Keep the handle; signers and accounts come from it, not the modal. */
  onConnect: (wallet: CosmosInjectedWallet) => void;
  /** Receives enable failures, e.g. the user rejecting the extension prompt. */
  onError?: ((error: Error) => void) | undefined;
};

/**
 * Discovers injected Cosmos wallets for {@link useProviderPairing}'s `sources`.
 *
 * Discovery only: after `onConnect` the app owns the Keplr handle, its signers, and its
 * lifecycle.
 */
export function useCosmosSource({ chainIds, onConnect, onError }: CosmosSourceOptions): LocalWalletSource {
  const [wallets, setWallets] = useState<readonly LocalWallet[]>(NO_WALLETS);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const detect = () => setWallets(detectCosmosWallets());
    detect();
    window.addEventListener("load", detect);
    return () => window.removeEventListener("load", detect);
  }, []);

  const connect = (wallet: LocalWallet) => {
    const probe = PROBES.find((candidate) => `cosmos:${candidate.key}` === wallet.id);
    const handle = probe && injectedAt(probe.key);
    if (!handle) {
      onError?.(new Error(`${wallet.name} is no longer available in this browser.`));
      return;
    }
    void handle
      .enable([...chainIds])
      .then(() => {
        setConnected(true);
        onConnect(handle);
      })
      .catch((e: unknown) => onError?.(e instanceof Error ? e : new Error(String(e))));
  };

  return { wallets, connect, connected };
}
