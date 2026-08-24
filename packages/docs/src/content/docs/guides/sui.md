---
title: Sui and custom namespaces
description: Connect Sui wallets with the generic forwarding adapter, and use the same recipe for any WalletConnect namespace Konekt does not ship.
---

Konekt ships adapters for EVM, Solana, Bitcoin, and Cosmos. Every other WalletConnect namespace follows one pattern: the app declares which methods exist, and each request is forwarded to the wallet. `forwardingNamespace()` from `konekt/generic` builds such an adapter in your application—no Konekt change, no extra package.

This page uses Sui as the worked example, then gives the general recipe.

## Build the Sui chain

The [WalletConnect Sui namespace](https://docs.reown.com/advanced/multichain/rpc-reference/sui-rpc) defines the chains `sui:mainnet`, `sui:testnet`, and `sui:devnet`, and four methods. Declare them once, in a file such as `src/chains/sui.ts`:

```ts
import { forwardingNamespace } from "konekt/generic";

const { chain: sui } = forwardingNamespace({
  namespace: "sui",
  methods: [
    "sui_getAccounts",
    "sui_signPersonalMessage",
    "sui_signTransaction",
    "sui_signAndExecuteTransaction",
  ],
});

export const suiMainnet = sui("mainnet");
```

Each `sui(reference)` call creates one chain. `sui("testnet")` and `sui("devnet")` work the same way.

:::note[The Sui RPC standard is still under review]
Reown marks these method signatures as subject to change, and wallet support varies. Confirm pairing and each method with the wallets you intend to support.
:::

## Connect

A custom chain configures the provider exactly like a shipped one:

```ts
import { Provider } from "konekt";
import { suiMainnet } from "./chains/sui";

const provider = await Provider.init({
  projectId: "YOUR_PROJECT_ID",
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],
  },
  chains: [suiMainnet],
});

// Render this as a QR code. See the Plain JavaScript guide.
const showPairingUri = (uri: string) => console.log(uri);

provider.on("display_uri", showPairingUri);
provider.on("request_sent", ({ url }) => {
  if (url) window.location.assign(url);
});

if (!provider.connected) await provider.connect();
```

The connection lifecycle—pairing, cancellation, restored sessions—is the same as everywhere else; [Plain JavaScript](../vanilla/) walks through it.

## Read the approved address

Approved addresses are grouped by CAIP-2 ID. A wallet can approve a session without a Sui account, so check before using one:

```ts
const [address] = provider.accountsByChain[suiMainnet.id] ?? [];
if (!address) throw new Error("The wallet approved no Sui account");
```

Session accounts are addresses only. When you also need public keys, ask the wallet:

```ts
const accounts = await provider.request({ method: "sui_getAccounts", params: {} });
// [{ pubkey: "…", address: "0x…" }] per the Sui RPC reference
```

## Sign

Forwarded methods take the parameters the namespace specification defines, and the wallet's result comes back as `unknown`—parse it before use:

```ts
const result = await provider.request({
  method: "sui_signPersonalMessage",
  params: { message: "Sign in to My app", address },
});

if (typeof result !== "object" || result === null || !("signature" in result)) {
  throw new Error("The wallet returned an unexpected signPersonalMessage result");
}
```

Transactions are built with your Sui SDK (such as `@mysten/sui`), serialized to base64-encoded BCS bytes, and sent as `transaction` alongside the sender's `address`:

```ts
declare const transactionBase64: string; // base64 BCS bytes from your Sui SDK

const executed = await provider.request({
  method: "sui_signAndExecuteTransaction",
  params: { transaction: transactionBase64, address },
});
// { digest: "…" } — look the transaction up in an explorer
```

`sui_signTransaction` signs without executing and returns `signature` and `transactionBytes`. Requesting a method the wallet declined during approval fails locally with `4200`, and the message lists what it did approve.

## The recipe for any namespace

Sui needed nothing Sui-specific: a namespace name, a method list, and a chain reference. Any forwarding-only namespace works the same way:

```ts
import { forwardingNamespace } from "konekt/generic";

const { chain } = forwardingNamespace({
  namespace: "example",
  methods: ["example_signMessage"],
  events: ["example_accountsChanged"],
});

const exampleMainnet = chain("mainnet");
```

Declared methods go to the wallet on the targeted, active, or first configured chain in the namespace. Declared session events surface as the provider's `message` event:

```ts
provider.on("message", ({ type, data }) => {
  if (type === "example_accountsChanged") refreshAddresses(data);
});
```

Konekt's own Solana, Bitcoin, and Cosmos adapters are this same forwarding adapter with their method lists filled in; only EVM is different, because it has local answers and a read transport. See [Chains and networks](../chains/) for how requests are routed.

## Where to go next

[Everything together](../multichain/) combines Sui with EVM, Solana, and Cosmos in one provider and one wallet modal.
