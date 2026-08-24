---
title: Plain JavaScript
description: Create a provider, show a pairing QR, and make your first wallet request with no framework and no UI package.
---

The React pages sit on one object: the Konekt `Provider`. This page uses it directly—no React, no wagmi, no konekt-ui. Everything is a method call or an event, so it works in any framework or in none.

Three terms appear throughout these docs:

- **Provider** — the object your app calls to connect, read account state, and send wallet requests.
- **Pairing** — the short-lived QR code or link that introduces the app to a wallet.
- **Session** — the connection that remains after the user approves the app.

This guide uses Ethereum mainnet, but the same provider can also connect to other EVM networks, Solana, Bitcoin, Cosmos, and custom namespaces.

## Before you start

You need:

- a browser application;
- a WalletConnect project ID from [WalletConnect Cloud](https://cloud.walletconnect.com/);
- a wallet that supports WalletConnect v2.

## Install

```sh
pnpm add konekt
```

You can use `npm install konekt` or `yarn add konekt` instead.

The modern-browser EVM path is 14.75 kB minified and gzipped through the first encrypted WalletConnect message. A matched Vite React app first-loads 10.95 kB with Konekt, against 145.74 kB for `@walletconnect/ethereum-provider`. Optional transports, features, chain adapters, and UI use separate entry points. See [Why Konekt is better](../why-konekt/) for the comparison and [Bundle size and loading](../bundle-size/) for complete measurements and on-demand initialization.

## 1. Create the provider

Import `Provider` from the main package and the EVM chain helper from `konekt/eip155`:

```ts
import { Provider } from "konekt";
import { ethereumMainnet } from "konekt/eip155";

const provider = await Provider.init({
  projectId: "YOUR_PROJECT_ID",
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],
  },
  chains: [ethereumMainnet],
});
```

`ethereumMainnet` is the ready-made Ethereum chain; the `evm()` factory builds any other EVM network from its chain ID. Do not pass a bare number to `chains`.

`Provider.init()` creates one shared provider for the current JavaScript runtime and restores a saved session when possible. Call it once during app setup. Later calls return the same provider and do not apply new options.

## 2. Show the pairing URI

Register the listener before calling `connect()`:

```ts
const showPairingUri = (uri: string) => {
  // Encode `uri` as a QR code and render it.
};

provider.on("display_uri", showPairingUri);

try {
  if (!provider.connected) {
    await provider.connect();
  }
} finally {
  provider.off("display_uri", showPairingUri);
}
```

`connect()` waits until the user approves or rejects the proposal. The `display_uri` event arrives while it is waiting. Any QR library can render the URI—it is an ordinary string. In React, [konekt-ui](../konekt-ui/) provides a complete modal, and its `QrCode` component alone renders the URI if that is all you need.

Pass an `AbortSignal` when your UI has a Cancel or Close button:

```ts
const controller = new AbortController();
const connecting = provider.connect({ signal: controller.signal });

function closePairingUi() {
  controller.abort();
}

const session = await connecting;
```

Do not log or permanently store the pairing URI. Treat it as a temporary connection secret.

## 3. Read the connected account

After the session connects, the EVM adapter adds `accounts` and `chainId` to the provider:

```ts
console.log(provider.accounts); // ["0x…"]
console.log(provider.chainId); // 1
```

These properties exist only when you configure at least one EVM chain. For an app with several chain namespaces, `provider.accountsByChain` groups every approved address by its [CAIP-2](https://chainagnostic.org/CAIPs/caip-2) chain ID:

```ts
console.log(provider.accountsByChain);
// { "eip155:1": ["0x…"] }
```

## 4. Send a wallet request

```ts
const signature = await provider.request({
  method: "personal_sign",
  params: ["0x48656c6c6f", provider.accounts[0]],
});
```

Signing and transaction methods go to the wallet. Read-only JSON-RPC methods such as `eth_getBalance` need an HTTP transport configured for that chain. See [Chains and networks](../chains/) for the distinction.

On mobile, the user must return to their wallet to approve. Listen for `request_sent` and open the wallet's URL; [Wallet UI](../wallet-ui/) covers this event and the rest of the event surface.

## Use an EVM client library

- [viem](../viem/) can wrap the provider with `custom()` for typed wallet actions and reads.
- [ethers](../ethers/) can wrap the provider with `BrowserProvider` for Ethers v6 signers and reads.
- [wagmi](../wagmi/) connects React state and hooks through the `konekt-ui/wagmi` connector.
- [Solana](../solana/) and [CosmJS](../cosmjs/) use small application-owned bridges over namespace requests.

## Disconnect

```ts
await provider.disconnect();
```

This ends the session and emits `disconnect`. The user will need to pair again before another wallet request.

## Common errors

Konekt throws `ProviderRpcError` for provider and JSON-RPC failures:

| Code | Meaning | What to do |
| --- | --- | --- |
| `4100` | There is no connected session. | Call and await `connect()` first. |
| `4200` | The method is unsupported, the wallet declined to approve it, or an EVM read has no transport. | Read the message: it names the method and, for a declined method, lists what the wallet did approve. |
| `-32602` | The request parameters are malformed, or the targeted chain is not configured. | Check the method’s expected `params`, and add the chain to `chains` before targeting it. |

User rejection and wallet errors can have other codes. Show the message to the user when it is useful, but do not assume every error is a Konekt error.

[Troubleshooting](../troubleshooting/) lists the errors Konekt throws as plain `Error` values, such as an expired proposal or a rejected relay connection.

## Creating isolated providers in tests

```ts
const testProvider = await Provider.create(
  { projectId: "test", metadata, chains: [ethereumMainnet] },
  { session: fakeSession },
);
```

`Provider.create()` returns a new instance every time. It is intended for tests that need to inject a relay, session, seed, or storage. When you inject `session`, Konekt does not open a real relay connection.

## Where to go next

- [Chains and networks](../chains/) — more EVM networks, JSON-RPC reads, and request routing.
- [Sessions and options](../sessions/) — storage, expiry, timeouts, and the rest of `Provider.init()`.
- [Wallet UI](../wallet-ui/) — the full event surface for building your own connection flow.
- [Solana](../solana/), [Cosmos](../cosmjs/), [Bitcoin](../bitcoin/), and [Sui](../sui/) — the same provider beyond Ethereum.
