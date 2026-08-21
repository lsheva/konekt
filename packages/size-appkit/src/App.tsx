import { useAppKit, useAppKitAccount } from "@reown/appkit/react";

export function App() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  return (
    <main>
      <h1>WalletConnect + AppKit</h1>
      {isConnected && address ? <p>{address}</p> : null}
      <button type="button" onClick={() => void open()}>
        {isConnected ? "Account" : "Connect"}
      </button>
    </main>
  );
}
