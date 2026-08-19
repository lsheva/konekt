---
title: Chains and networks
description: Configure EVM, Solana, Bitcoin, Cosmos, or a custom WalletConnect namespace.
---

Konekt includes only the chain adapters you import. Each adapter describes a WalletConnect **namespace**—a family of networks with the same methods, such as EVM (`eip155`) or Solana.

You give `Provider.init()` one or more `Chain` objects:

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

Do not write `chains: [1, 8453]`. Numeric IDs are accepted only as arguments to `evm()`.

## Chain IDs

WalletConnect identifies a network with a [CAIP-2](https://chainagnostic.org/CAIPs/caip-2) string in the form `namespace:reference`.

| Network | Konekt configuration | CAIP-2 ID |
| --- | --- | --- |
| Ethereum mainnet | `evm(1)` | `eip155:1` |
| Base | `evm(8453)` | `eip155:8453` |
| Solana mainnet | `solana` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Bitcoin mainnet | `bitcoin` | `bip122:000000000019d6689c085ae165831e93` |
| Cosmos Hub | `cosmoshub` | `cosmos:cosmoshub-4` |

The number passed to `evm()` is the ordinary decimal EVM chain ID. The other namespaces use string references defined by their CAIP standards.

## EVM networks

Import `evm` from `konekt/eip155`:

```ts
import { evm } from "konekt/eip155";

const ethereumAndBase = evm(1, 8453);
```

The EVM adapter handles methods in three ways:

- `eth_chainId`, `eth_accounts`, and `eth_requestAccounts` are answered from provider state.
- Signing, transaction, and chain-switching methods are sent to the wallet.
- Other `eth_*`, `net_*`, and `web3_*` methods are sent to the chain’s optional `read` transport.

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

Use a transport connected to the same network as the chain. When several IDs share one `evm()` call, they also share its `read` function; split them as above when each network has a different RPC URL.

The read transport is not a fallback for arbitrary methods. For example, `personal_sign` always goes to the wallet, while an unknown method still fails with error `4200`.

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

By default, a request uses the active chain in its namespace. If there is no active chain yet, Konekt uses the first configured chain in that namespace.

Pass a CAIP-2 ID as the second argument to target one request:

```ts
const balance = await provider.request(
  { method: "eth_getBalance", params: [account, "latest"] },
  "eip155:8453",
);
```

This does not change the active chain. The target must already be present in the provider’s `chains` configuration.

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
