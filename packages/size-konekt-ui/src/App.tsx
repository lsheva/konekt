import { useCallback, useEffect, useState } from "react";
import { Provider } from "konekt";
import { type EvmExt, evm } from "konekt/eip155";
import { useProviderPairing, WalletModal } from "konekt-ui";
import "konekt-ui/styles.css";
import { metadata, projectId } from "./meta";

type EvmProvider = Provider & EvmExt;

export function App() {
  const [provider, setProvider] = useState<EvmProvider>();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const pairing = useProviderPairing(provider);
  const [address, setAddress] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    void Provider.init({
      projectId,
      metadata,
      chains: evm(1),
    })
      .then((next) => {
        if (cancelled) return;
        const evmProvider = next as EvmProvider;
        evmProvider.on("accountsChanged", (accounts) => setAddress(accounts[0]));
        evmProvider.on("disconnect", () => setAddress(undefined));
        const [account] = evmProvider.accounts;
        if (account) setAddress(account);
        setProvider(evmProvider);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const disconnect = useCallback(async () => {
    if (!provider) return;
    await provider.disconnect();
  }, [provider]);

  return (
    <main>
      <h1>Konekt + UI</h1>
      {address ? (
        <>
          <p>{address}</p>
          <button type="button" onClick={() => void disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <button type="button" disabled={!provider} onClick={() => setOpen(true)}>
          Connect
        </button>
      )}
      {error ? <p>{error}</p> : null}
      <WalletModal open={open} projectId={projectId} pairing={pairing} onClose={() => setOpen(false)} />
    </main>
  );
}
