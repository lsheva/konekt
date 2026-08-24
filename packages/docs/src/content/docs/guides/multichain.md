---
title: Everything together
description: One provider, one wallet modal, and one session covering EVM, Solana, Cosmos, Bitcoin, and Sui.
---

Each previous page connected one ecosystem. A Konekt provider is not limited to one: give it every chain your app supports, and it makes a single WalletConnect proposal covering all of them. The user approves once, and the wallet grants what it can.

This page assembles the pieces: one provider, one modal that also lists injected Solana and Cosmos extensions, and the routing rules for using each ecosystem afterwards.

## One provider, every network

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";
import { http } from "konekt/http";
import { solanaMainnet } from "konekt/solana";
import { cosmoshub } from "konekt/cosmos";
import { bitcoinMainnet } from "konekt/bip122";
import { suiMainnet } from "./chains/sui"; // from the Sui guide

export const provider = await Provider.init({
  projectId: "YOUR_PROJECT_ID",
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],
  },
  chains: [
    evm(1, { read: http("https://ethereum.example-rpc.com") }),
    solanaMainnet,
    cosmoshub,
    bitcoinMainnet,
    suiMainnet,
  ],
});
```

Each adapter comes from its own entry point, so an app that drops a namespace later also drops its code. Only the EVM chain takes a `read` transport; the other namespaces send every method to the wallet.

`Provider.init()` is a process singleton and the first call fixes the options, so this one call must list every chain and feature the app can ever use.

:::note[Use the provider path, not the wagmi connector]
The `konekt-ui/wagmi` connector builds its provider from the wagmi config, which only describes EVM chains. A multi-ecosystem app should own `Provider.init()` as above and drive the UI with `useProviderPairing`. Wagmi can still wrap the same connection for its EVM hooks, but the provider configuration must not be delegated to it.
:::

## One modal

`useProviderPairing` drives `WalletModal` from the provider. `sources` add injected extensions—Phantom-style Solana wallets through Wallet Standard, and Keplr-style Cosmos wallets—as installed choices next to WalletConnect pairing:

```tsx
import { useState } from "react";
import type { Provider } from "konekt";
import { useProviderPairing, WalletModal } from "konekt-ui";
import { type CosmosInjectedWallet, useCosmosSource } from "konekt-ui/cosmos";
import { useWalletStandardSource, type WalletStandardWallet } from "konekt-ui/wallet-standard";
import "konekt-ui/styles.css";

export function MultiChainConnection({ provider }: { provider: Provider }) {
  const [open, setOpen] = useState(false);
  const [solanaWallet, setSolanaWallet] = useState<WalletStandardWallet>();
  const [cosmosWallet, setCosmosWallet] = useState<CosmosInjectedWallet>();

  const solana = useWalletStandardSource({ onConnect: setSolanaWallet });
  const cosmos = useCosmosSource({ chainIds: ["cosmoshub-4"], onConnect: setCosmosWallet });
  const pairing = useProviderPairing(provider, { sources: [solana, cosmos] });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Connect wallet
      </button>
      <WalletModal open={open} pairing={pairing} onClose={() => setOpen(false)} />
    </>
  );
}
```

An injected wallet connects outside the session: after `onConnect`, the app signs with that wallet's own API, and the Konekt provider is not involved. The bridges and request patterns below apply to accounts approved over the WalletConnect session.

## What the wallet actually granted

`chains` is a proposal, not a guarantee. A wallet may approve some namespaces and skip others, so read the result instead of assuming it:

```ts
console.log(provider.accountsByChain);
// {
//   "eip155:1": ["0x…"],
//   "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": ["…"],
//   "cosmos:cosmoshub-4": ["cosmos1…"],
// }

const [solanaAddress] = provider.accountsByChain[solanaMainnet.id] ?? [];
```

Requesting a method the wallet declined fails locally with `4200`, and the message lists what it did approve. Build the UI from `accountsByChain`: show each ecosystem's features only when the wallet granted an account for it.

## Route each ecosystem's work

The session is shared; the client libraries on top stay per-ecosystem, exactly as in their individual guides:

| Ecosystem | On top of the provider | Guide |
| --- | --- | --- |
| EVM | viem `custom(provider)`, ethers `BrowserProvider`, or raw `request()` | [viem](../viem/), [ethers](../ethers/) |
| Solana | The application-owned web3.js or Kit bridge | [Solana](../solana/) |
| Cosmos | The application-owned CosmJS signer factories | [Cosmos](../cosmjs/) |
| Bitcoin | Raw `request()` with parsed results | [Bitcoin](../bitcoin/) |
| Sui | Raw `request()` with parsed results | [Sui](../sui/) |

Every namespace has an active chain—initially the first one you configured for it—and a request targets its namespace's active chain by default. To aim one request elsewhere, pass a CAIP-2 ID as the second argument; the chain must be in the `chains` configuration:

```ts
const balance = await provider.request(
  { method: "eth_getBalance", params: [account, "latest"] },
  "eip155:1",
);
```

The Solana and Cosmos bridges take a `chainId` when you create them, so one provider serves mainnet and devnet wallets side by side. [Chains and networks](../chains/#targeting-a-chain) covers the selection rules.

## Add sign-in

Authentication rides the same single approval. Add `siwe()` to `features` in the `Provider.init()` call and the wallet signs in while it approves the session—one flow, no second prompt. The server then verifies the result with `konekt/cacao`. [Authentication](../features/) covers both halves.

## Keep it light

A five-namespace app does not need to ship five namespaces to every visitor:

- Each adapter, the read transport, SIWE, and the UI are separate imports; nothing above pulled in code for a namespace it does not use.
- The whole wallet stack can load on demand—`Provider.init()` behind the connect click, the modal behind `React.lazy`. The [bundle size guide](../bundle-size/) shows the measured patterns.
- Keep `konekt/cacao` on the server. Browser code never verifies signatures.

## Where to go next

You have seen the whole library. What remains is reference:

- [Chains and networks](../chains/) — routing rules, named chains, read transports.
- [Sessions and options](../sessions/) — persistence, expiry, timeouts, diagnostics.
- [Frameworks and SSR](../frameworks/) — Next.js and other server-rendered setups.
- [Troubleshooting](../troubleshooting/) — every error, with fixes.
