---
title: Bitcoin
description: Connect to Bitcoin wallets over WalletConnect and send signing requests with the bip122 adapter.
---

The `bip122` adapter proposes the Bitcoin namespace and forwards its methods to the wallet. There are no local answers and no read transport: every supported method is a wallet request.

## Configure the provider

```ts
import { Provider } from "konekt";
import { bitcoinMainnet } from "konekt/bip122";

const provider = await Provider.init({
  projectId: "YOUR_PROJECT_ID",
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],
  },
  chains: [bitcoinMainnet],
});

// Render this as a QR code. See the Wallet UI guide.
const showPairingUri = (uri: string) => console.log(uri);

provider.on("display_uri", showPairingUri);
provider.on("request_sent", ({ url }) => {
  if (url) window.location.assign(url);
});

if (!provider.connected) await provider.connect();
```

`chains` always takes an array, so a single Bitcoin chain is `[bitcoinMainnet]`.

| Export | CAIP-2 ID |
| --- | --- |
| `bitcoinMainnet` | `bip122:000000000019d6689c085ae165831e93` |
| `bitcoinTestnet` | `bip122:000000000933ea01ad0ee984209779ba` |
| `bitcoinSignet` | `bip122:00000008819873e925422c1ff0f99f7c` |

The reference is the genesis block hash prefix. Build another network with `bitcoin(reference)`.

## Read the approved addresses

Approved addresses are grouped by CAIP-2 ID. A wallet can approve a session without a Bitcoin account, so check before using one:

```ts
const [address] = provider.accountsByChain[bitcoinMainnet.id] ?? [];
if (!address) throw new Error("The wallet approved no Bitcoin account");
```

`getAccountAddresses` asks the wallet for its full address list, including the public keys and derivation paths that the CAIP-10 session accounts do not carry:

```ts
const addresses = await provider.request({ method: "getAccountAddresses" });
```

## Supported methods

The adapter proposes these methods. A wallet may approve a subset.

| Method | Purpose |
| --- | --- |
| `getAccountAddresses` | Address list with public keys and derivation paths. |
| `signMessage` | Sign a message with the key for a given address. |
| `signPsbt` | Sign a partially signed Bitcoin transaction. |
| `sendTransfer` | Ask the wallet to build, sign, and broadcast a transfer. |
| `bip122_signTransaction` | Sign a raw transaction. |

Parameters and result shapes are defined by the WalletConnect Bitcoin specification and the wallet, not by Konekt. Konekt passes `params` through unchanged and returns the wallet’s result as `unknown`, so parse it before use:

```ts
const result = await provider.request({
  method: "signMessage",
  params: { account: address, message: "Sign in to My app" },
});

if (typeof result !== "object" || result === null || !("signature" in result)) {
  throw new Error("The wallet returned an unexpected signMessage result");
}
```

Requesting a method the wallet declined during approval fails locally with `4200`, and the message lists what it did approve.

## Address changes

The adapter proposes one event, `bip122_addressesChanged`. Forwarding namespaces surface their events through the provider’s `message` event rather than a namespace-specific one:

```ts
provider.on("message", ({ type, data }) => {
  if (type === "bip122_addressesChanged") refreshAddresses(data);
});
```

## Target another Bitcoin network

Configure every network you use, then target one request without moving the active chain:

```ts
import { bitcoinMainnet, bitcoinTestnet } from "konekt/bip122";

// chains: [bitcoinMainnet, bitcoinTestnet]
const result = await provider.request(
  { method: "getAccountAddresses" },
  bitcoinTestnet.id,
);
```

Targeting a chain that is not in `chains` fails with `-32602`.

## Check with a wallet

Bitcoin wallet support for these methods varies more than EVM support does. Confirm pairing, the methods you depend on, PSBT handling, and request redirects with each wallet you intend to support.
