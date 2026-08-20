---
title: CosmJS
description: Use Konekt as CosmJS Amino and direct OfflineSigners, with lossless WalletConnect encodings.
---

Konekt’s Cosmos adapter forwards `cosmos_getAccounts`, `cosmos_signAmino`, and `cosmos_signDirect`. It does not implement CosmJS `OfflineSigner` types. Keep small application factories so CosmJS can select Amino or direct signing without mixing the two.

Copy the repository’s tested factories from [`packages/integrations/src/cosmjs`](https://github.com/lsheva/konekt/blob/main/packages/integrations/src/cosmjs). Do not add a `konekt/cosmjs` wrapper.

## Copy the bridge

Copy these five files, keeping their relative layout, because they import each other:

```
src/
  bridge/
    bytes.ts          # base64 helpers and response parsing
    request.ts        # the RequestClient type
    cosmjs/
      accounts.ts     # cosmos_getAccounts and signature parsing
      amino.ts        # the OfflineAminoSigner
      direct.ts       # the OfflineDirectSigner
```

They import each other with explicit `.ts` extensions, which TypeScript accepts under `"allowImportingTsExtensions": true` (with `noEmit`) or `"rewriteRelativeImportExtensions": true`. Change the extensions to `.js` if your setup requires it.

## Install

```sh
pnpm add konekt @scure/base @cosmjs/amino @cosmjs/proto-signing cosmjs-types
```

`@scure/base` backs the base64 conversions and `cosmjs-types` supplies the `SignDoc` type the direct signer uses. Add your CosmJS client library as well; the examples below use `@cosmjs/stargate`:

```sh
pnpm add @cosmjs/stargate
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
  chains: [cosmoshub],
});

// Render this as a QR code. See the Wallet UI guide.
const showPairingUri = (uri: string) => console.log(uri);

provider.on("display_uri", showPairingUri);
provider.on("request_sent", ({ url }) => {
  if (url) window.location.assign(url);
});

if (!provider.connected) await provider.connect();
```

`chains` always takes an array, so a single Cosmos chain is `[cosmoshub]`, not `cosmoshub`.

See [Wallet UI](../wallet-ui/) for rendering the pairing URI and cancelling an attempt.

Session accounts are CAIP-10 bech32 addresses. They do not include `algo` or `pubkey`. CosmJS needs both, so the bridges call `cosmos_getAccounts` on the wallet.

## Keep Amino and direct signers separate

CosmJS treats a signer with `signDirect` as a direct signer. If one object also has `signAmino`, CosmJS will not use Amino. Export two factories:

```ts
import { SigningStargateClient } from "@cosmjs/stargate";
import { cosmoshub } from "konekt/cosmos";
import { konektAminoSigner } from "./bridge/cosmjs/amino.ts";
import { konektDirectSigner } from "./bridge/cosmjs/direct.ts";

const rpcUrl = "https://cosmoshub.example-rpc.com";

const amino = konektAminoSigner(provider, { chainId: cosmoshub.id });
const direct = konektDirectSigner(provider, { chainId: cosmoshub.id });

const aminoClient = await SigningStargateClient.connectWithSigner(rpcUrl, amino);
const directClient = await SigningStargateClient.connectWithSigner(rpcUrl, direct);
```

Use the Amino factory for Amino-only wallets. Use the direct factory when the wallet approved `cosmos_signDirect`.

Target Osmosis without changing the active chain. Add it to `chains` first, or the request fails with `-32602`:

```ts
import { osmosis } from "konekt/cosmos";

// chains: [cosmoshub, osmosis]
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

```ts ignore
const [account] = await direct.getAccounts();
if (!account) throw new Error("The wallet did not return an account");

const recipient = "cosmos1examplerecipientaddress";

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
