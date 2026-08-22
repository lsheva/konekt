---
title: Migrating from @walletconnect/ethereum-provider
description: Translate an existing EthereumProvider.init setup to Konekt option by option.
---

Konekt implements the same EIP-1193 surface as `@walletconnect/ethereum-provider`, so most application code that calls `request()` and listens for events needs no changes. The differences are in configuration, in the QR modal, and in where JSON-RPC reads go.

[Why Konekt is better](../why-konekt/) covers the reasoning. This page is the mechanical translation.

## Install

```sh
pnpm remove @walletconnect/ethereum-provider
pnpm add konekt
```

Konekt is ESM-only and has no `@walletconnect` runtime dependency.

## The smallest change

Before:

```ts
import { EthereumProvider } from "@walletconnect/ethereum-provider";

const provider = await EthereumProvider.init({
  projectId,
  metadata,
  optionalChains: [1, 137],
  showQrModal: true,
});
```

After:

```ts
import { Provider } from "konekt";
import { ethereumMainnet, polygonMainnet } from "konekt/eip155";

const provider = await Provider.init({
  projectId,
  metadata,
  chains: [ethereumMainnet, polygonMainnet],
});

provider.on("display_uri", (uri) => renderQrCode(uri));
```

Both return an EIP-1193 provider. `provider.request()`, `provider.enable()`, `provider.on()`, `provider.session`, and `provider.disconnect()` all keep working.

## Option by option

| `EthereumProvider.init` | Konekt | Notes |
| --- | --- | --- |
| `projectId` | `projectId` | Unchanged. |
| `metadata` | `metadata` | Unchanged. |
| `optionalChains: [1, 137]` | `chains: [ethereumMainnet, polygonMainnet]` | Named chains, or `evm(id)` for the rest. Bare numbers are not accepted. |
| `chains: [1]` | `chains: [ethereumMainnet]` | Konekt has no required namespaces; see below. |
| `rpcMap: { 1: url }` | `evm(1, { read: http(url) })` | Per chain, and never automatic. |
| `showQrModal: true` | `display_uri` event, or `konekt-ui` | See [Wallet UI](../wallet-ui/) and [konekt-ui](../konekt-ui/). |
| `qrModalOptions` | `WalletModal` props | See [konekt-ui](../konekt-ui/). |
| `optionalMethods`, `optionalEvents` | Adapter-defined | See [Methods and events](#methods-and-events). |
| `methods`, `events` | Adapter-defined | Same. |
| — | `features: [siwe(...)]` | One-click authentication. See [Authentication](../features/). |
| — | `storage`, `relayUrl`, `ttl`, `onDebug` | See [Sessions](../sessions/). |

### Required namespaces are gone

`EthereumProvider` builds a required-namespace proposal when you pass `chains`, `methods`, or `events`, which blocks wallets that do not support all of them. Konekt always proposes optional namespaces, which is the behavior Reown itself recommends. Every chain you configure is offered, the wallet approves what it supports, and you read the result:

```ts
provider.session?.namespaces.eip155?.accounts;
provider.accountsByChain; // { "eip155:1": ["0x…"] }
```

A method the wallet declined then fails locally with `4200` instead of reaching the wallet.

### `rpcMap` becomes an explicit transport

This is the biggest behavioral difference. Without `rpcMap`, `EthereumProvider` silently falls back to Reown’s Blockchain API, so `eth_call` and `eth_getBalance` work without your configuring anything, and your users’ reads go to a third-party endpoint.

Konekt never does that. A chain without a `read` transport rejects JSON-RPC reads with `4200`:

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";
import { http } from "konekt/http";

const provider = await Provider.init({
  projectId,
  metadata,
  chains: [
    evm(1, { read: http("https://ethereum.example-rpc.com") }),
    evm(137, { read: http("https://polygon.example-rpc.com") }),
  ],
});
```

If viem, ethers, or wagmi already owns your public reads, skip `konekt/http` entirely and let those libraries keep their own transports. That is the common case, and it keeps 253 bytes out of your bundle.

### `showQrModal` becomes an event

`EthereumProvider` bundled a modal. Konekt reports the pairing URI and lets your app render it:

```ts
provider.on("display_uri", (uri) => renderQrCode(uri));
await provider.connect();
```

For a ready-made React modal, install `konekt-ui`:

```tsx ignore
import { useProviderPairing, WalletModal } from "konekt-ui";
import "konekt-ui/styles.css";

const pairing = useProviderPairing(provider);

<WalletModal open={open} projectId={projectId} pairing={pairing} onClose={close} />;
```

`showQrModal` is deprecated upstream in favor of AppKit, so an app still using it has to change something regardless. See [konekt-ui](../konekt-ui/).

## Methods and events

`optionalMethods` and `optionalEvents` do not exist. The EVM adapter proposes a fixed list: `eth_sendTransaction`, `personal_sign`, `eth_sign`, `eth_signTransaction`, the four `eth_signTypedData` variants, `eth_accounts`, `eth_requestAccounts`, and `wallet_switchEthereumChain`, with the `chainChanged` and `accountsChanged` events.

To propose something else, declare your own namespace with `forwardingNamespace()` and configure it alongside the EVM chains. See [Build a custom namespace](../chains/#build-a-custom-namespace).

## Events

| `EthereumProvider` | Konekt |
| --- | --- |
| `display_uri` | `display_uri`, same payload |
| `connect` | `connect`, payload `{ chainId?: "0x1" }` |
| `disconnect` | `disconnect`, payload `{ code, message }` |
| `accountsChanged` | `accountsChanged`, same payload |
| `chainChanged` | `chainChanged`, same payload |
| `session_event` | `message` for non-EVM namespaces; EVM events are already mapped |
| — | `request_sent`, for opening the wallet on mobile |

:::caution[`disconnect` now fires for app-initiated disconnects too]
`EthereumProvider` emits `disconnect` only when the wallet ends the session, so apps often clear state in two places. Konekt emits it for both, including your own `provider.disconnect()` call. Remove the duplicate cleanup, or you will run it twice.
:::

`request_sent` is new and worth adopting. It carries the wallet URL for a pending request so a mobile user can be returned to their wallet:

```ts
provider.on("request_sent", ({ url }) => {
  if (url) window.location.assign(url);
});
```

## Things to check after migrating

- **`sendAsync()` is not implemented.** Use `request()`. Callback-style code needs updating.
- **Reads.** Anything that previously relied on the Blockchain API fallback now needs a `read` transport or a separate client. This is the most likely source of a `4200` after migrating.
- **Reconnecting after disconnect.** `Provider.init()` is a process singleton, and `disconnect()` closes its relay client permanently. See [Sessions](../sessions/#ending-a-session).
- **Session storage keys changed**, so users will pair again once. Konekt uses `konekt:seed`, `konekt:keys`, and `konekt:session`.
- **Chain switching.** `wallet_switchEthereumChain` is answered locally when the session already includes the target chain, and forwarded to the wallet otherwise. Configure every chain you support.
- **Server-side rendering.** Konekt has no server build. See [Frameworks and SSR](../frameworks/).

## With viem, ethers, or wagmi

Nothing changes structurally. Konekt is still the EIP-1193 provider you hand to those libraries:

- viem: `custom(provider)` — see the [viem guide](../viem/);
- ethers v6: `new BrowserProvider(provider)` — see the [ethers guide](../ethers/);
- wagmi: the `konekt(options)` connector from `konekt-ui/wagmi` — see the [wagmi guide](../wagmi/).

If you were using `@walletconnect/ethereum-provider` through wagmi’s built-in `walletConnect()` connector, replace that connector rather than the provider directly.
