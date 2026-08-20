---
title: Solana
description: Sign Solana messages and transactions with Konekt using @solana/web3.js or @solana/kit.
---

Konekt’s Solana adapter forwards WalletConnect methods. It does not implement `@solana/web3.js` or `@solana/kit` wallet types. Keep a small application bridge that encodes requests and checks wallet responses.

The repository’s tested bridges live in [`packages/integrations/src/solana`](https://github.com/lsheva/konekt/blob/main/packages/integrations/src/solana). Copy them into your app. Do not add a `konekt/solana-client` wrapper.

## Copy the bridge

Copy these four files, keeping their relative layout, because they import each other:

```
src/
  bridge/
    bytes.ts          # base58 and base64 helpers
    request.ts        # the RequestClient type
    solana/
      rpc.ts          # WalletConnect method encoding
      web3.ts         # the @solana/web3.js wallet
      kit.ts          # the @solana/kit wallet, if you use Kit
```

They import each other with explicit `.ts` extensions, which TypeScript accepts under `"allowImportingTsExtensions": true` (with `noEmit`) or `"rewriteRelativeImportExtensions": true`. Vite, Next.js, and other bundlers resolve them as written. Change the extensions to `.js` if your setup requires it.

## Install

```sh
pnpm add konekt @scure/base @solana/web3.js
```

`@scure/base` is what `bytes.ts` uses for base58 and base64. For the Kit bridge, add `@solana/kit` instead of or alongside `@solana/web3.js`. You also need a WalletConnect project ID.

:::caution[`@solana/web3.js` v1 needs `Buffer` in the browser]
The legacy `Transaction` path calls `Buffer.from()`. Vite apps generally need a polyfill such as `vite-plugin-node-polyfills`, or a `globalThis.Buffer` shim, before signing legacy transactions. Kit and `VersionedTransaction` do not need it.
:::

## Create and connect the provider

```ts
import { Provider } from "konekt";
import { solana } from "konekt/solana";

const provider = await Provider.init({
  projectId: "YOUR_PROJECT_ID",
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],
  },
  chains: [solana],
});

// Render this as a QR code. See the Wallet UI guide.
const showPairingUri = (uri: string) => console.log(uri);

provider.on("display_uri", showPairingUri);
provider.on("request_sent", ({ url }) => {
  if (url) window.location.assign(url);
});

if (!provider.connected) await provider.connect();
```

`chains` always takes an array, so a single Solana chain is `[solana]`, not `solana`.

See [Wallet UI](../wallet-ui/) for rendering the pairing URI and cancelling an attempt, and [Getting started](../getting-started/) for the connection lifecycle.

### Read the approved address

Approved addresses are grouped by CAIP-2 ID on `provider.accountsByChain`. A wallet can approve a session without any Solana account, so check before you use one:

```ts
const [address] = provider.accountsByChain[solana.id] ?? [];
if (!address) throw new Error("The wallet approved no Solana account");
```

That list holds base58 addresses, not public keys as bytes. When a client needs the wallet’s current pubkeys, call `solana_getAccounts` through the bridge’s `solanaPubkeys()` helper in `rpc.ts`.

## Wire encodings

WalletConnect Solana methods use these encodings. The bridges below apply them for you.

| Method | Request | Result |
| --- | --- | --- |
| `solana_signMessage` | `message` base58, `pubkey` base58 | `signature` base58 |
| `solana_signTransaction` | `transaction` base64 | `signature` base58, optional `transaction` base64 |
| `solana_signAllTransactions` | `transactions` base64[] | `transactions` base64[] in the same order |
| `solana_signAndSendTransaction` | `transaction` base64, optional `sendOptions` | `signature` base58 |

Send the serialized transaction bytes in `transaction`. Do not use the deprecated instruction-list parameters; they cannot represent versioned transactions.

If `solana_signTransaction` returns only a signature, apply it to the original transaction. If it also returns `transaction`, deserialize that payload and use it. Wallets may add signatures or instructions.

## @solana/web3.js

`konektWeb3Wallet()` from `web3.ts` exposes the wallet interface most Solana code expects:

```ts
import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { solana } from "konekt/solana";
import { konektWeb3Wallet } from "./bridge/solana/web3.ts";

const rpcUrl = "https://api.mainnet-beta.solana.com";
const connection = new Connection(rpcUrl);

const publicKey = new PublicKey(address);
const wallet = konektWeb3Wallet(provider, { publicKey, chainId: solana.id });

const signature = await wallet.signMessage(new TextEncoder().encode("Sign in to My app"));

const transaction = new Transaction().add(
  SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: publicKey, lamports: 1 }),
);
transaction.feePayer = publicKey;
transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

const signed = await wallet.signTransaction(transaction);
```

`signTransaction` accepts both legacy `Transaction` and `VersionedTransaction` and returns the same type it received. `signAndSendTransaction` asks the wallet to broadcast instead:

```ts ignore
const txSignature = await wallet.signAndSendTransaction(transaction, { skipPreflight: false });
```

Target another configured Solana chain without changing the active chain. Add it to `chains` first, or the request fails with `-32602`:

```ts
import { solana, solanaDevnet } from "konekt/solana";

// chains: [solana, solanaDevnet]
const devnetWallet = konektWeb3Wallet(provider, {
  publicKey: new PublicKey(address),
  chainId: solanaDevnet.id,
});
```

## @solana/kit

`kit.ts` encodes Kit `Transaction` objects, then decodes the wallet’s signed bytes:

```ts
import type { Transaction } from "@solana/kit";
import { solana } from "konekt/solana";
import { konektKitWallet } from "./bridge/solana/kit.ts";

declare const transaction: Transaction;

const wallet = konektKitWallet(provider, { address, chainId: solana.id });

const signature = await wallet.signMessage(new TextEncoder().encode("Sign in to My app"));
const signed = await wallet.signTransaction(transaction);
```

Build and compile the Kit transaction as you already do. The bridge only handles WalletConnect encoding, response checks, and deserialization.

## Check with a wallet

Protocol-shape tests cover encodings, CAIP-2 targeting, legacy and versioned transactions, and malformed responses. They do not prove that a particular mobile wallet signs every method. Confirm QR pairing, cancellation, request redirects, and both transaction types with the wallets you support.
