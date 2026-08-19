import { useCallback, useMemo, useState } from "react";
import type { LocalWallet, Pairing } from "./WalletModal.tsx";

/**
 * Provider surface used by {@link useProviderPairing}.
 *
 * A Konekt `Provider` satisfies this type without an adapter or wrapper.
 */
export type PairingProvider = {
  /** Whether the provider already has an approved session. */
  connected: boolean;
  /** The chains this provider proposes. The modal lists wallets that support them. */
  chains?: readonly { id: string }[] | undefined;
  /** Starts a connection and accepts a signal for cancellation. */
  connect: (opts?: { signal?: AbortSignal | undefined }) => Promise<unknown>;
  /** Adds a pairing-URI listener. */
  on: (event: "display_uri", listener: (uri: string) => void) => void;
  /** Removes a pairing-URI listener. */
  off: (event: "display_uri", listener: (uri: string) => void) => void;
};

const NO_WALLETS: readonly LocalWallet[] = [];
const noop = () => {};

/**
 * Creates a {@link Pairing} for a Konekt provider without wagmi.
 *
 * Starting the pairing calls `provider.connect({ signal })` and subscribes to `display_uri`.
 * Running the returned teardown aborts the connection and removes the listener. Provider chains
 * become the modal's default Explorer filter.
 *
 * @param provider Provider to connect. It may be `undefined` while application setup is loading;
 * the returned pairing reports a readable error if started before the provider exists.
 */
export function useProviderPairing(provider?: PairingProvider): Pairing {
  /** `connected` is a getter on the provider, so a settled session has to nudge React to read it again. */
  const [, setSettled] = useState(0);
  const [error, setError] = useState<string>();

  const start = useCallback(
    (onUri: (uri: string) => void) => {
      if (!provider) {
        setError("No provider to pair with. Pass one to useProviderPairing.");
        return noop;
      }
      if (provider.connected) {
        setSettled((n) => n + 1);
        return noop;
      }
      const controller = new AbortController();
      const stop = () => provider.off("display_uri", onUri);
      setError(undefined);
      provider.on("display_uri", onUri);
      void provider
        .connect({ signal: controller.signal })
        .then(() => setSettled((n) => n + 1))
        .catch((e: unknown) => {
          if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
        })
        .finally(stop);
      return () => {
        controller.abort();
        stop();
      };
    },
    [provider],
  );

  const reset = useCallback(() => setError(undefined), []);
  const chains = useMemo(() => provider?.chains?.map((c) => c.id), [provider]);

  return {
    connected: provider?.connected ?? false,
    local: NO_WALLETS,
    connectLocal: noop,
    start,
    reset,
    error,
    chains,
  };
}
