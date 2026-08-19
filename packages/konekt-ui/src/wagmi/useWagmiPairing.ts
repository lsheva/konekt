import { useCallback, useMemo, useRef, useState } from "react";
import type { Connector } from "wagmi";
import { useConnect, useConnection, useConnectors } from "wagmi";
import type { LocalWallet, Pairing } from "../WalletModal.tsx";

const KONEKT = "konekt";

export type WagmiPairingOptions = {
  /** Registers the WalletConnect connector on demand when the config was built without one. */
  getWalletConnect?: (() => Promise<Connector>) | undefined;
};

function isWalletConnect(connector: Connector): boolean {
  return connector.type === KONEKT || connector.id === KONEKT;
}

function toLocalWallet(connector: Connector): LocalWallet {
  return { id: connector.uid, name: connector.name, icon: connector.icon, rdns: connector.id };
}

/** Pairing through wagmi: injected connectors are local wallets, the konekt connector carries the QR. */
export function useWagmiPairing({ getWalletConnect }: WagmiPairingOptions = {}): Pairing {
  const connectors = useConnectors();
  const { mutate, reset: resetConnect, error: connectError } = useConnect();
  const { isConnected } = useConnection();
  const [error, setError] = useState<string>();

  const latest = useRef(connectors);
  latest.current = connectors;

  const local = useMemo(() => connectors.filter((c) => !isWalletConnect(c)).map(toLocalWallet), [connectors]);

  const connectLocal = useCallback(
    (wallet: LocalWallet) => {
      const connector = latest.current.find((c) => c.uid === wallet.id);
      if (connector) mutate({ connector });
    },
    [mutate],
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
        mutate({ connector: wc });
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
    [getWalletConnect, mutate],
  );

  const reset = useCallback(() => {
    setError(undefined);
    resetConnect();
  }, [resetConnect]);

  return { connected: isConnected, local, connectLocal, start, reset, error: error ?? connectError?.message };
}
