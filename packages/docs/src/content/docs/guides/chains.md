---
title: Chains and networks
description: Configure EVM, Solana, Bitcoin, Cosmos, or a custom WalletConnect namespace.
---

Konekt includes only the chain adapters you import. Each adapter describes a WalletConnect **namespace**—a family of networks with the same methods, such as EVM (`eip155`) or Solana.

## Chain IDs

WalletConnect identifies a network with a [CAIP-2](https://chainagnostic.org/CAIPs/caip-2) string in the form `namespace:reference`. Each adapter exports ready-made chains for its common networks:

| Network | Konekt configuration | CAIP-2 ID |
| --- | --- | --- |
| Ethereum mainnet | `evm(1)` | `eip155:1` |
| Base | `evm(8453)` | `eip155:8453` |
| Solana mainnet | `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Bitcoin mainnet | `bitcoin` | `bip122:000000000019d6689c085ae165831e93` |
| Cosmos Hub | `cosmoshub` | `cosmos:cosmoshub-4` |

The number passed to `evm()` is the ordinary decimal EVM chain ID. The other namespaces use string references defined by their CAIP standards.

## Configure the provider

Give `Provider.init()` one or more of those `Chain` objects:

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";
import { solana } from "konekt/solana";
import { bitcoin } from "konekt/bip122";
import { cosmoshub } from "konekt/cosmos";

const provider = await Provider.init({
  projectId,
  metadata,
  chains: [evm(1, 8453), solana, bitcoin, cosmoshub],
});
```

`evm(1, 8453)` returns a list, while the named non-EVM exports are individual chains. Konekt flattens this one level for you.

Do not write `chains: [1, 8453]`. Numeric IDs are accepted only as arguments to `evm()`. A single non-EVM chain still needs an array, because `chains` always takes a list:

```ts
const provider = await Provider.init({ projectId, metadata, chains: [solana] });
```

## EVM networks

Import `evm` from `konekt/eip155`:

```ts
import { evm } from "konekt/eip155";

const ethereumAndBase = evm(1, 8453);
```

The EVM adapter routes each method one of four ways:

| Outcome | Methods |
| --- | --- |
| Answered locally from session state | `eth_chainId` always; `eth_accounts` and `eth_requestAccounts` once a session exists; `wallet_switchEthereumChain` when the wallet already approved the requested chain |
| Sent to the wallet | Signing and transaction methods, plus `wallet_switchEthereumChain` for a chain the session does not yet include |
| Sent to the chain’s `read` transport | The remaining `eth_*`, `net_*`, and `web3_*` methods |
| Rejected without reaching the wallet | Everything else |

Two rejections are worth knowing before you debug them:

- Account and wallet methods throw `4100` when there is no session yet. Await `connect()` first.
- A method the wallet declined during approval throws `4200` locally rather than producing an opaque wallet error. The message lists what the wallet did approve.

### Add JSON-RPC reads

`http()` creates a JSON-RPC transport for read-only calls:

```ts
import { Provider } from "konekt";
import { http } from "konekt/http";
import { evm } from "konekt/eip155";

const ethereum = evm(1, {
  read: http("https://ethereum.example-rpc.com"),
});

const base = evm(8453, {
  read: http("https://base.example-rpc.com"),
});

const provider = await Provider.init({
  projectId,
  metadata,
  chains: [ethereum, base],
});
```

Use a transport connected to the same network as the chain. When several IDs share one `evm()` call, they also share its `read` function, so split them as above when each network has a different RPC URL. Reading from an EVM chain you configured without a `read` transport fails with error `4200` rather than borrowing another chain’s transport.

The read transport is not a fallback for arbitrary methods. For example, `personal_sign` always goes to the wallet, while an unknown method still fails with error `4200`.

:::caution[Configure `read` on every EVM chain you read from]
If the wallet switches to an EVM chain that is not in your `chains` configuration, later reads fall back to the first configured EVM chain’s transport and answer with data from the wrong network. Configure every chain your app supports, and treat `chainChanged` for an unknown chain as an unsupported-network state in your UI.
:::

After you configure EVM, the provider has two additional properties:

- `provider.chainId` — the active decimal EVM chain ID;
- `provider.accounts` — the unique EVM addresses approved by the wallet.

## Other namespaces

Solana, Bitcoin, and Cosmos send every supported request to the wallet. They do not have built-in HTTP reads.

| Import | Ready-made chains | Build another chain |
| --- | --- | --- |
| `konekt/solana` | `solana`, `solanaDevnet`, `solanaTestnet` | `solanaChain(reference)` |
| `konekt/bip122` | `bitcoin`, `bitcoinTestnet`, `bitcoinSignet` | `bitcoinChain(reference)` |
| `konekt/cosmos` | `cosmoshub`, `osmosis` | `cosmosChain(reference)` |

The `reference` is the part after the colon in a CAIP-2 ID. For example:

```ts
import { cosmosChain } from "konekt/cosmos";

const myCosmosNetwork = cosmosChain("my-chain-1");
// id: "cosmos:my-chain-1"
```

## Targeting a chain

By default, a request uses the active chain in its namespace. Each namespace starts with the first chain you configured for it as the active one, so there is always an active chain.

Pass a CAIP-2 ID as the second argument to target one request:

```ts
const balance = await provider.request(
  { method: "eth_getBalance", params: [account, "latest"] },
  "eip155:8453",
);
```

This does not change the active chain. The target must already be present in the provider’s `chains` configuration; targeting anything else throws `-32602` with a message naming the missing chain.

To ask an EVM wallet to switch its active chain, send the standard wallet method:

```ts
await provider.request({
  method: "wallet_switchEthereumChain",
  params: [{ chainId: "0x2105" }], // Base, decimal 8453
});
```

## Build a custom namespace

Use `forwardingNamespace()` when a WalletConnect namespace only needs to forward a known list of methods and events:

```ts
import { forwardingNamespace } from "konekt/generic";

const { chain: myChain } = forwardingNamespace({
  namespace: "example",
  methods: ["example_signMessage"],
  events: ["example_accountsChanged"],
});

const example = myChain("mainnet");
```

Declared methods go to the wallet. Declared events appear as the provider’s `message` event:

```ts
provider.on("message", ({ type, data }) => {
  console.log(type, data);
});
```

Import adapters from their subpaths rather than from `konekt`. This keeps the core package independent of chain-specific code and lets your bundler omit adapters you do not use.

Client libraries such as [viem](../viem/), [ethers](../ethers/), [Solana web3.js and Kit](../solana/), and [CosmJS](../cosmjs/) sit on top of these adapters. They are not extra Konekt packages.
