---
title: wagmi
description: Connect a wagmi 3 React app through Konekt and use the optional wallet and account UI.
---

Wagmi needs a connector that translates its connection lifecycle into EIP-1193 provider calls. Konekt supplies the provider; a small application connector adapts it to wagmi.

In this setup:

- wagmi’s viem HTTP transports handle public reads;
- the Konekt connector handles accounts, signatures, transactions, and chain switching;
- `konekt-ui/wagmi` can render the connect, account, and network controls.

This guide targets React 19, wagmi 3, and viem 2.

## Install

```sh
pnpm add konekt konekt-ui viem wagmi @tanstack/react-query react react-dom
```

You also need a WalletConnect project ID.

## Add the Konekt connector

Konekt does not ship a wagmi-specific connector. Keeping the adapter in the application lets it follow the app’s wagmi version and connection policy without adding wagmi to Konekt’s core.

Copy the repository’s tested [Konekt connector implementation](https://github.com/lsheva/konekt/blob/main/packages/example/src/konekt.ts) into your application, for example as `src/konekt.ts`. It exports `konekt(options)` for wagmi configuration and `abortPairing()` for cancelling the current proposal.

The connector:

- creates `Provider.init()` lazily when wagmi first requests it;
- configures EVM chains from the wagmi config;
- maps Konekt account, chain, and disconnect events into wagmi events;
- exposes `display_uri` through the connector’s `message` event;
- opens the wallet URL from `request_sent`;
- aborts a pending proposal through `abortPairing()`.

## Create the wagmi config

Register the connector next to injected browser wallets:

```tsx
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { konekt } from "./konekt";

const projectId = "YOUR_PROJECT_ID";

export const konektOptions = {
  projectId,
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: "https://app.example.com",
    icons: ["https://app.example.com/icon.png"],
  },
};

export const config = createConfig({
  chains: [mainnet, base],
  connectors: [
    injected(),
    konekt(konektOptions),
  ],
  transports: {
    [mainnet.id]: http("https://ethereum.example-rpc.com"),
    [base.id]: http("https://base.example-rpc.com"),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
```

Registering the connector does not open a relay socket. Its provider is created only when wagmi calls the connector.

The wagmi `transports` are intentionally separate from Konekt’s optional EVM `read` transport. Wagmi sends public reads through its viem clients and sends wallet actions through the active connector.

## Add the complete connect UI

`ConnectButton` renders:

- a connect trigger;
- installed connectors and WalletConnect Explorer wallets;
- a WalletConnect pairing QR;
- connected account and balance details;
- network switching and disconnect controls.

```tsx
import { ConnectButton } from "konekt-ui/wagmi";
import "konekt-ui/styles.css";
import { abortPairing } from "./konekt";
import { konektOptions } from "./web3";

export function WalletControls() {
  return (
    <ConnectButton
      projectId={konektOptions.projectId}
      onDismiss={abortPairing}
    />
  );
}
```

`onDismiss` matters because closing the modal should also abort the proposal owned by the connector. The modal itself removes its connector event listener; `abortPairing()` stops the underlying Konekt connection.

## Use wagmi hooks

Once connected, Konekt behaves like the app’s other wagmi connectors:

```tsx
import { formatUnits, parseEther } from "viem";
import {
  useBalance,
  useConnection,
  useDisconnect,
  useSendTransaction,
  useSwitchChain,
} from "wagmi";
import { base } from "wagmi/chains";

export function AccountActions() {
  const connection = useConnection();
  const balance = useBalance({ address: connection.address });
  const transaction = useSendTransaction();
  const switching = useSwitchChain();
  const disconnecting = useDisconnect();

  if (!connection.isConnected || !connection.address) {
    return <p>No wallet connected.</p>;
  }

  return (
    <section>
      <p>{connection.address}</p>
      <p>
        {balance.data
          ? `${formatUnits(balance.data.value, balance.data.decimals)} ${balance.data.symbol}`
          : "Loading balance…"}
      </p>

      <button
        type="button"
        disabled={transaction.isPending}
        onClick={() =>
          transaction.mutate({
            to: "0x000000000000000000000000000000000000dEaD",
            value: parseEther("0.001"),
          })
        }
      >
        Send transaction
      </button>

      <button
        type="button"
        disabled={switching.isPending}
        onClick={() => switching.mutate({ chainId: base.id })}
      >
        Switch to Base
      </button>

      <button
        type="button"
        disabled={disconnecting.isPending}
        onClick={() => disconnecting.mutate()}
      >
        Disconnect
      </button>
    </section>
  );
}
```

The connector forwards the wallet actions to Konekt. Reads such as `useBalance()` continue to use the HTTP transport in the wagmi config.

## Use your own trigger and modal

Use `useWagmiPairing()` when you want to keep your own connect button while reusing the wallet picker:

```tsx
import { useState } from "react";
import { WalletModal } from "konekt-ui";
import { useWagmiPairing } from "konekt-ui/wagmi";
import { abortPairing } from "./konekt";

export function CustomWalletButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const pairing = useWagmiPairing();

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Choose a wallet
      </button>
      <WalletModal
        open={open}
        projectId={projectId}
        pairing={pairing}
        onDismiss={abortPairing}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

## Static and lazy connector registration

Static registration in `createConfig()` is the recommended path. The connector already delays `Provider.init()` until first use, so registration has no relay cost.

`ConnectButton` and `useWagmiPairing` also accept `getWalletConnect` for applications with their own supported runtime connector-registration mechanism. Avoid depending on wagmi’s private `_internal` APIs in production integration code.

To keep the provider and modal out of the initial page chunk, follow the [lazy-loading patterns and measured bundle sizes](../bundle-size/).

## Troubleshooting

### “No WalletConnect connector is registered”

Add `konekt(konektOptions)` to `createConfig({ connectors })`. The connector’s `id` or `type` must be `"konekt"`.

### The QR closes but pairing continues

Pass `onDismiss={abortPairing}` to `ConnectButton` or `WalletModal`.

### Reads work but signatures do not

Wagmi HTTP transports handle reads without a wallet. Confirm that the Konekt connector is active and that the user approved a session before sending wallet actions.

### A chain is missing

Add it to the wagmi `chains` array and provide its HTTP transport. The connector derives its proposed EVM chains from that config.
