---
title: Getting started
description: Add a wallet connect button to a React app with konekt, konekt-ui, and wagmi.
---

By the end of this page, your React app has a **Connect wallet** button. Clicking it opens a wallet picker with a QR code, the user approves the connection in a wallet on their phone, and your app can show their address and send transactions.

Three packages share the work, and each does one job:

| Package | Job |
| --- | --- |
| `konekt` | Speaks the WalletConnect v2 protocol to the wallet. |
| `konekt-ui` | Renders the connect button, wallet picker, and pairing QR. |
| `wagmi` | Keeps account, chain, and balance state in React hooks. |

This is the smallest amount of code to a working connection, and also the smallest download: this stack first-loads **18.98 kB** in a production Vite app, where AppKit first-loads **721.26 kB**. You do not need to care about that yet—it simply means there is no penalty for starting the easy way.

## Before you start

You need:

- a React 18 or 19 app—`pnpm create vite my-app --template react-ts` works;
- a free project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/);
- a wallet app that supports WalletConnect v2, such as MetaMask, Rainbow, or Trust Wallet, usually on your phone.

## 1. Install

```sh
pnpm add konekt konekt-ui wagmi viem @tanstack/react-query
```

You can use `npm install` or `yarn add` instead. `konekt-ui` works with React 18 or 19; the wagmi packages can be v2 or v3. The snippets use hook names both wagmi versions export (`useAccount`, `connect`).

## 2. Describe your app and networks

Create `src/web3.tsx`. It tells wagmi which networks you support and which wallets can connect—browser extensions through `injected()`, and every WalletConnect wallet through the `konekt` connector:

```tsx
import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { konekt } from "konekt-ui/wagmi";

export const projectId = "YOUR_PROJECT_ID";

export const config = createConfig({
  chains: [mainnet],
  connectors: [
    injected(),
    konekt({
      projectId,
      metadata: {
        name: "My app",
        description: "Connect to My app",
        url: window.location.origin,
        icons: [new URL("/icon.png", window.location.origin).href],
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(),
  },
});

// Types chain IDs across wagmi hooks as a union of your configured chains instead of plain `number`.
declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

const queryClient = new QueryClient();

export function Web3Provider({ children }: PropsWithChildren) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
```

The `metadata` is what the wallet shows the user when it asks "allow this app to connect?".

To support more networks later, add them to `chains` and `transports`—for example `base` from `wagmi/chains`.

## 3. Wrap your app

In `src/main.tsx`, put `Web3Provider` around the app:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Web3Provider } from "./web3";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Web3Provider>
      <App />
    </Web3Provider>
  </StrictMode>,
);
```

## 4. Add the button

`ConnectButton` is the complete flow: the trigger, the wallet picker, the QR code, and—once connected—account, network, and disconnect controls.

```tsx
import { abortPairing, ConnectButton } from "konekt-ui/wagmi";
import "konekt-ui/styles.css";

export function WalletControls() {
  return <ConnectButton onDismiss={abortPairing} />;
}
```

Import the stylesheet once, anywhere in your app. The button finds your project ID through the connector you registered in step 2. `onDismiss={abortPairing}` makes closing the modal also cancel the pending connection.

## 5. Use the connection

Once connected, the wallet behaves like any other wagmi connection. Every wagmi hook works:

```tsx
import { formatUnits } from "viem";
import { useAccount, useBalance } from "wagmi";

export function Account() {
  const account = useAccount();
  const balance = useBalance({ address: account.address });

  if (!account.isConnected || !account.address) {
    return <p>No wallet connected.</p>;
  }

  return (
    <section>
      <p>{account.address}</p>
      {balance.data && (
        <p>
          {formatUnits(balance.data.value, balance.data.decimals)} {balance.data.symbol}
        </p>
      )}
    </section>
  );
}
```

Sending a transaction is `useSendTransaction()`, switching networks is `useSwitchChain()`—see the [wagmi guide](../wagmi/) for a complete account panel.

## Try it

Run the dev server, click **Connect wallet**, pick a wallet or scan the QR code with your phone, and approve. Three things are worth noticing:

- The approved connection is called a **session**. It is saved in the browser, so the user stays connected across page reloads.
- The QR code carries a one-time **pairing** secret that introduces your app to the wallet. A new one is created for each attempt.
- Signing and transactions are approved in the wallet, not in your app. On mobile, konekt-ui returns the user to their wallet automatically.

## Where to go next

Take these in order—each page assumes the ones before it, and nothing more:

1. [Design your own connect UI](../custom-ui/) — keep your own buttons and dialogs; the hooks do the work.
2. [Plain JavaScript](../vanilla/) — the provider underneath all of this, with no React and no UI package.
3. [Solana](../solana/), [Cosmos](../cosmjs/), [Bitcoin](../bitcoin/), and [Sui](../sui/) — the same provider beyond Ethereum.
4. [Everything together](../multichain/) — one connection covering several ecosystems at once.

When something misbehaves, [Troubleshooting](../troubleshooting/) lists every error and its fix.
