---
title: Solana
description: Sign Solana messages and transactions with Konekt using @solana/web3.js or @solana/kit.
---

Konekt’s Solana adapter forwards WalletConnect methods. It does not implement `@solana/web3.js` or `@solana/kit` wallet types. Keep a small application bridge that encodes requests and checks wallet responses.

The repository’s tested bridges live in [`packages/integrations/src/solana`](https://github.com/lsheva/konekt/blob/main/packages/integrations/src/solana). Copy them into your app. Do not add a `konekt/solana-client` wrapper.

## Install

```sh
pnpm add konekt @solana/web3.js
```

For the Kit bridge, install `@solana/kit` instead of or as well as `@solana/web3.js`. You also need a WalletConnect project ID.

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
  chains: solana,
});

provider.on("display_uri", showPairingUri);
provider.on("request_sent", ({ url }) => {
  if (url) window.location.assign(url);
});

if (!provider.connected) await provider.connect();
```

Approved addresses are grouped by CAIP-2 ID on `provider.accountsByChain`. That list does not include public keys as bytes. Call `solana_getAccounts` when a client needs the wallet’s current pubkey objects.

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

Copy [`web3.ts`](https://github.com/lsheva/konekt/blob/main/packages/integrations/src/solana/web3.ts) and [`rpc.ts`](https://github.com/lsheva/konekt/blob/main/packages/integrations/src/solana/rpc.ts):

```ts
import { PublicKey, Connection, SystemProgram, Transaction } from "@solana/web3.js";
import { konektWeb3Wallet } from "./solana/web3";

const publicKey = new PublicKey(provider.accountsByChain[solana.id][0]);
const wallet = konektWeb3Wallet(provider, { publicKey, chainId: solana.id });

const signature = await wallet.signMessage(new TextEncoder().encode("Sign in to My app"));

const tx = new Transaction().add(
  SystemProgram.transfer({ fromPubkey: publicKey, toPubkey: publicKey, lamports: 1 }),
);
tx.feePayer = publicKey;
tx.recentBlockhash = (await new Connection(rpcUrl).getLatestBlockhash()).blockhash;

const signed = await wallet.signTransaction(tx);
const versioned = await wallet.signTransaction(versionedTransaction);
```

`signTransaction` accepts both legacy `Transaction` and `VersionedTransaction`. `signAndSendTransaction` asks the wallet to broadcast.

Target another configured Solana chain without changing the active chain:

```ts
import { solanaDevnet } from "konekt/solana";

const devnetWallet = konektWeb3Wallet(provider, {
  publicKey,
  chainId: solanaDevnet.id,
});
```

## @solana/kit

Copy [`kit.ts`](https://github.com/lsheva/konekt/blob/main/packages/integrations/src/solana/kit.ts) as well. It encodes Kit `Transaction` objects, then decodes the wallet’s signed bytes:

```ts
import { konektKitWallet } from "./solana/kit";

const address = provider.accountsByChain[solana.id][0];
const wallet = konektKitWallet(provider, { address, chainId: solana.id });

const signature = await wallet.signMessage(new TextEncoder().encode("Sign in to My app"));
const signed = await wallet.signTransaction(transaction);
```

Build and compile the Kit transaction as you already do. The bridge only handles WalletConnect encoding, response checks, and deserialization.

## Check with a wallet

Protocol-shape tests cover encodings, CAIP-2 targeting, legacy and versioned transactions, and malformed responses. They do not prove that a particular mobile wallet signs every method. Confirm QR pairing, cancellation, request redirects, and both transaction types with the wallets you support.
