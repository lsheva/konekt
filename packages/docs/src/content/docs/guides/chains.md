---
title: Chains and networks
description: Configure EVM, Solana, Bitcoin, Cosmos, or a custom WalletConnect namespace.
---

Konekt includes only the chain adapters you import. Each adapter describes a WalletConnect **namespace**—a family of networks with the same methods, such as EVM (`eip155`) or Solana.

## Chain IDs

WalletConnect identifies a network with a [CAIP-2](https://chainagnostic.org/CAIPs/caip-2) string in the form `namespace:reference`. Each adapter exports ready-made chains for its common networks:

| Network | Konekt configuration | CAIP-2 ID |
| --- | --- | --- |
| Ethereum mainnet | `ethereumMainnet` | `eip155:1` |
| Base | `baseMainnet` | `eip155:8453` |
| Solana mainnet | `solanaMainnet` | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| Bitcoin mainnet | `bitcoinMainnet` | `bip122:000000000019d6689c085ae165831e93` |
| Cosmos Hub | `cosmoshub` | `cosmos:cosmoshub-4` |

EVM chains can also be built from the ordinary decimal chain ID: `evm(1)` creates the same chain as `ethereumMainnet`. The other namespaces use string references defined by their CAIP standards.

## Configure the provider

Give `Provider.init()` one or more of those `Chain` objects:

```ts
import { Provider } from "konekt";
import { baseMainnet, ethereumMainnet } from "konekt/eip155";
import { solanaMainnet } from "konekt/solana";
import { bitcoinMainnet } from "konekt/bip122";
import { cosmoshub } from "konekt/cosmos";

const provider = await Provider.init({
  projectId,
  metadata,
  chains: [ethereumMainnet, baseMainnet, solanaMainnet, bitcoinMainnet, cosmoshub],
});
```

Each factory call creates one chain; named exports such as `solanaMainnet` are ready-made chains. Mix them freely in the array.

Do not write `chains: [1, 8453]`. Numeric IDs are accepted only as arguments to `evm()`. A single named chain still needs an array, because `chains` always takes a list:

```ts
const provider = await Provider.init({ projectId, metadata, chains: [solanaMainnet] });
```

## EVM networks

Named exports (listed below) cover the common networks. `evm()` builds any other EVM chain from its decimal chain ID:

```ts
import { evm } from "konekt/eip155";

const zksync = evm(324);
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

Use a transport connected to the same network as the chain. One `evm()` call creates one chain, so networks with different RPC URLs are separate calls, as above. Reading from an EVM chain you configured without a `read` transport fails with error `4200` rather than borrowing another chain’s transport.

The read transport is not a fallback for arbitrary methods. For example, `personal_sign` always goes to the wallet, while an unknown method still fails with error `4200`.

### Named chains

`konekt/eip155` exports the most common networks and their canonical testnets:

| Export | CAIP-2 ID |
| --- | --- |
| `ethereumMainnet` | `eip155:1` |
| `ethereumSepolia` | `eip155:11155111` |
| `baseMainnet` | `eip155:8453` |
| `baseSepolia` | `eip155:84532` |
| `bscMainnet` | `eip155:56` |
| `bscTestnet` | `eip155:97` |
| `arbitrumMainnet` | `eip155:42161` |
| `arbitrumSepolia` | `eip155:421614` |
| `optimismMainnet` | `eip155:10` |
| `optimismSepolia` | `eip155:11155420` |
| `polygonMainnet` | `eip155:137` |
| `polygonAmoy` | `eip155:80002` |

Named chains carry no read transport. For JSON-RPC reads, build the chain with `evm()` and a `read`, or pass a chain definition as below.

### viem, wagmi, and AppKit definitions

`evm()` accepts chain definitions from viem, wagmi, or AppKit directly. The definition’s first default HTTP RPC URL becomes that chain’s read transport, so reads work with no extra configuration:

```ts
import { evm } from "konekt/eip155";
import { base, mainnet } from "viem/chains";

chains: [evm(mainnet), evm(base)];
```

With wagmi, pass the config’s chains unchanged:

```ts ignore
chains: config.chains.map((c) => evm(c));
```

An explicit `read` overrides the definition’s URL, as in `evm(mainnet, { read: http(myRpcUrl) })`. Bare numeric IDs never get an implicit transport.

For a network outside the named set, import its definition from `viem/chains` and pass it to `evm()` the same way.

:::caution[Configure `read` on every EVM chain you read from]
If the wallet switches to an EVM chain that is not in your `chains` configuration, later reads fall back to the first configured EVM chain’s transport and answer with data from the wrong network. Configure every chain your app supports, and treat `chainChanged` for an unknown chain as an unsupported-network state in your UI.
:::

After you configure EVM, the provider has two additional properties:

- `provider.chainId` — the active decimal EVM chain ID;
- `provider.accounts` — the unique EVM addresses approved by the wallet.

## Other namespaces

Solana, Bitcoin, and Cosmos send every supported request to the wallet. They do not have built-in HTTP reads.

| Import | Ready-made chains | Build other chains |
| --- | --- | --- |
| `konekt/solana` | `solanaMainnet`, `solanaDevnet`, `solanaTestnet` | `solana(reference)` |
| `konekt/bip122` | `bitcoinMainnet`, `bitcoinTestnet`, `bitcoinSignet` | `bitcoin(reference)` |
| `konekt/cosmos` | `cosmoshub`, `osmosis` | `cosmos(reference)` |

The `reference` is the part after the colon in a CAIP-2 ID. Each factory also accepts a network definition with a string `id`, such as AppKit’s Solana and Bitcoin networks. For example:

```ts
import { cosmos } from "konekt/cosmos";

const myCosmosNetwork = cosmos("my-chain-1");
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
