import { useCallback, useEffect, useState } from "react";
import { EthereumProvider } from "@walletconnect/ethereum-provider";
import { metadata, projectId } from "./meta";

type SessionProvider = Awaited<ReturnType<typeof EthereumProvider.init>>;

export function App() {
  const [provider, setProvider] = useState<SessionProvider>();
  const [address, setAddress] = useState<string>();
  const [uri, setUri] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void EthereumProvider.init({
      projectId,
      metadata,
      optionalChains: [1],
      showQrModal: false,
    })
      .then((next) => {
        if (cancelled) {
          void next.disconnect();
          return;
        }
        next.on("display_uri", (nextUri: string) => setUri(nextUri));
        next.on("accountsChanged", (accounts: string[]) => setAddress(accounts[0]));
        next.on("disconnect", () => {
          setAddress(undefined);
          setUri(undefined);
        });
        const [account] = next.accounts;
        if (account) setAddress(account);
        setProvider(next);
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
      <h1>WalletConnect</h1>
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
