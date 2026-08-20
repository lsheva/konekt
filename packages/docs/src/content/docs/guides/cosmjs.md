---
title: CosmJS
description: Use Konekt as CosmJS Amino and direct OfflineSigners, with lossless WalletConnect encodings.
---

Konekt’s Cosmos adapter forwards `cosmos_getAccounts`, `cosmos_signAmino`, and `cosmos_signDirect`. It does not implement CosmJS `OfflineSigner` types. Keep small application factories so CosmJS can select Amino or direct signing without mixing the two.

Copy the repository’s tested factories from [`packages/integrations/src/cosmjs`](https://github.com/lsheva/konekt/blob/main/packages/integrations/src/cosmjs). Do not add a `konekt/cosmjs` wrapper.

## Install

```sh
pnpm add konekt @cosmjs/stargate @cosmjs/amino @cosmjs/proto-signing
```

You also need a WalletConnect project ID and a Cosmos RPC URL for CosmJS queries.

## Create and connect the provider

```ts
import { Provider } from "konekt";
import { cosmoshub } from "konekt/cosmos";

const provider = await Provider.init({
  projectId: "YOUR_PROJECT_ID",
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],
  },
  chains: cosmoshub,
});

provider.on("display_uri", showPairingUri);
provider.on("request_sent", ({ url }) => {
  if (url) window.location.assign(url);
});

if (!provider.connected) await provider.connect();
```

Session accounts are CAIP-10 bech32 addresses. They do not include `algo` or `pubkey`. CosmJS needs both, so the bridges call `cosmos_getAccounts` on the wallet.

## Keep Amino and direct signers separate

CosmJS treats a signer with `signDirect` as a direct signer. If one object also has `signAmino`, CosmJS will not use Amino. Export two factories:

```ts
import { SigningStargateClient } from "@cosmjs/stargate";
import { konektAminoSigner } from "./cosmjs/amino";
import { konektDirectSigner } from "./cosmjs/direct";

const amino = konektAminoSigner(provider, { chainId: cosmoshub.id });
const direct = konektDirectSigner(provider, { chainId: cosmoshub.id });

const aminoClient = await SigningStargateClient.connectWithSigner(rpcUrl, amino);
const directClient = await SigningStargateClient.connectWithSigner(rpcUrl, direct);
```

Use the Amino factory for Amino-only wallets. Use the direct factory when the wallet approved `cosmos_signDirect`.

Target Osmosis without changing the active chain:

```ts
import { osmosis } from "konekt/cosmos";

const osmoSigner = konektDirectSigner(provider, { chainId: osmosis.id });
```

## Lossless encodings

WalletConnect Cosmos methods are JSON. CosmJS direct sign docs are not.

| Field | CosmJS | WalletConnect |
| --- | --- | --- |
| `bodyBytes`, `authInfoBytes` | `Uint8Array` | base64 strings |
| `accountNumber` | `bigint` | decimal string |
| Amino `account_number`, `sequence`, `fee` | strings | strings |
| account `pubkey` | `Uint8Array` | base64 string |

Convert account numbers with `bigint.toString()`. Do not pass them through `Number`; values above `Number.MAX_SAFE_INTEGER` would round.

The direct bridge encodes those fields on the way out and decodes them on the way back. If the wallet returns a `signed` document, that document is what CosmJS must use. Wallets often change fees.

## Sign with CosmJS

```ts
const [account] = await direct.getAccounts();
if (!account) throw new Error("The wallet did not return an account");

const result = await directClient.sendTokens(
  account.address,
  recipient,
  [{ denom: "uatom", amount: "1000" }],
  "auto",
);
```

`sendTokens` will call `signDirect` or `signAmino` according to which signer you passed. The Konekt `request_sent` listener can open the wallet while that request is pending.

## Check with a wallet

Tests cover method names, CAIP-2 targeting, base64/bigint conversion, large account numbers, malformed responses, and preserved wallet sign documents. They do not prove Amino or direct support in a given mobile wallet. Confirm pairing, cancellation, redirects, and the signing mode you ship with the wallets you support.
