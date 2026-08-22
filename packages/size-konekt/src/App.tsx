import { useCallback, useEffect, useState } from "react";
import { Provider } from "konekt";
import { type EvmExt, evm } from "konekt/eip155";
import { metadata, projectId } from "./meta";

type EvmProvider = Provider & EvmExt;

export function App() {
  const [provider, setProvider] = useState<EvmProvider>();
  const [address, setAddress] = useState<string>();
  const [uri, setUri] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Provider.init({
      projectId,
      metadata,
      chains: [evm(1)],
    })
      .then((next) => {
        if (cancelled) return;
        const evmProvider = next as EvmProvider;
        evmProvider.on("display_uri", setUri);
        evmProvider.on("accountsChanged", (accounts) => setAddress(accounts[0]));
        evmProvider.on("disconnect", () => {
          setAddress(undefined);
          setUri(undefined);
        });
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

  const connect = useCallback(async () => {
    if (!provider) return;
    setError(undefined);
    setBusy(true);
    try {
      await provider.connect();
      const [account] = provider.accounts;
      setAddress(account);
      setUri(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [provider]);

  const disconnect = useCallback(async () => {
    if (!provider) return;
    await provider.disconnect();
    setAddress(undefined);
    setUri(undefined);
  }, [provider]);

  return (
    <main>
      <h1>Konekt</h1>
      {address ? (
        <>
          <p>{address}</p>
          <button type="button" onClick={() => void disconnect()}>
            Disconnect
          </button>
        </>
      ) : (
        <>
          <button type="button" disabled={!provider || busy} onClick={() => void connect()}>
            Connect
          </button>
          {uri ? <pre>{uri}</pre> : null}
        </>
      )}
      {error ? <p>{error}</p> : null}
    </main>
  );
}
