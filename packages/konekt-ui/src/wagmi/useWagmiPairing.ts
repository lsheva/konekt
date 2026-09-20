import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Connector } from "wagmi";
import { useAccount, useConnect, useConnectors } from "wagmi";
import type { LocalWallet, Pairing } from "../WalletModal.tsx";

const KONEKT = "konekt";
const INJECTED = "injected";

/** Options for {@link useWagmiPairing}. */
export type WagmiPairingOptions = {
  /**
   * Registers and returns the Konekt connector on demand when the wagmi config does not already
   * contain one.
   */
  getWalletConnect?: (() => Promise<Connector>) | undefined;
  /**
   * Project ID for Wallet Explorer listings when no Konekt connector is registered at the time the
   * modal opens, which happens with `getWalletConnect`. A registered connector supplies its own.
   */
  projectId?: string | undefined;
};

function isWalletConnect(connector: Connector): boolean {
  return connector.type === KONEKT || connector.id === KONEKT;
}

/** wagmi names its targetless injected connector `injected`; EIP-6963 entries carry their rdns. */
function isGenericInjected(connector: Connector): boolean {
  return connector.type === INJECTED && connector.id === INJECTED;
}

/**
 * The injected connectors whose provider the browser actually has.
 *
 * A wagmi config registers `injected()` whether or not an extension answers, so a browser without
 * one — mobile Safari, most often — would otherwise be offered a wallet it cannot reach.
 */
function useInjectedProviders(connectors: readonly Connector[]): ReadonlySet<string> {
  const [present, setPresent] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    const probe = connectors
      .filter((c) => c.type === INJECTED)
      .map((c) => c.getProvider().then((provider) => (provider ? c.uid : undefined)));
    void Promise.all(probe).then((uids) => {
      if (!cancelled) setPresent(new Set(uids.filter((uid): uid is string => uid !== undefined)));
    });
    return () => {
      cancelled = true;
    };
  }, [connectors]);

  return present;
}

function projectIdOf(connector: Connector | undefined): string | undefined {
  const value: unknown = connector && (connector as { projectId?: unknown }).projectId;
  return typeof value === "string" ? value : undefined;
}

function toLocalWallet(connector: Connector): LocalWallet {
  return { id: connector.uid, name: connector.name, icon: connector.icon, rdns: connector.id };
}

/**
 * Creates a {@link Pairing} from the nearest wagmi provider.
 *
 * Connectors other than Konekt become local wallet choices, injected ones only while their provider
 * is in the browser. A connector whose `id` or `type` is `"konekt"` starts WalletConnect pairing and
 * supplies `display_uri` through its message emitter. If no such connector is registered, pass
 * `getWalletConnect` to create it lazily.
 */
export function useWagmiPairing({ getWalletConnect, projectId }: WagmiPairingOptions = {}): Pairing {
  const connectors = useConnectors();
  const { connect, reset: resetConnect, error: connectError } = useConnect();
  const { isConnected } = useAccount();
  const [error, setError] = useState<string>();

  const latest = useRef(connectors);
  latest.current = connectors;

  const injected = useInjectedProviders(connectors);
  const local = useMemo(() => {
    const usable = connectors.filter((c) => !isWalletConnect(c) && (c.type !== INJECTED || injected.has(c.uid)));
    /** One wallet, one row: a named EIP-6963 entry says everything the generic connector would. */
    const named = usable.some((c) => c.type === INJECTED && !isGenericInjected(c));
    return usable.filter((c) => !named || !isGenericInjected(c)).map(toLocalWallet);
  }, [connectors, injected]);

  const connectLocal = useCallback(
    (wallet: LocalWallet) => {
      const connector = latest.current.find((c) => c.uid === wallet.id);
      if (connector) connect({ connector });
    },
    [connect],
  );

  const start = useCallback(
    (onUri: (uri: string) => void) => {
      const onMessage = ({ type, data }: { type: string; data?: unknown }) => {
        if (type === "display_uri" && typeof data === "string") onUri(data);
      };
      let cancelled = false;
      let stop = () => {};
      const listen = (wc: Connector) => {
        if (cancelled) return;
        wc.emitter.on("message", onMessage);
        stop = () => wc.emitter.off("message", onMessage);
        connect({ connector: wc });
      };

      setError(undefined);
      const registered = latest.current.find(isWalletConnect);
      if (registered) listen(registered);
      else if (getWalletConnect) {
        void getWalletConnect()
          .then(listen)
          .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
      } else setError("No WalletConnect connector is registered. Add one to the wagmi config.");

      return () => {
        cancelled = true;
        stop();
      };
    },
    [connect, getWalletConnect],
  );

  const reset = useCallback(() => {
    setError(undefined);
    resetConnect();
  }, [resetConnect]);

  return {
    connected: isConnected,
    local,
    connectLocal,
    start,
    reset,
    error: error ?? connectError?.message,
    projectId: projectIdOf(connectors.find(isWalletConnect)) ?? projectId,
  };
}
