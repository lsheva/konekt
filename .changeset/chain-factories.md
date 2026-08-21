---
"konekt": minor
---

Rework the chain adapter exports into one symmetric shape per module. Every factory call creates exactly one chain, so options such as `read` can never leak across networks:

```ts
chains: [evm(1, { read: http(mainnetRpc) }), evm(base, { read: http(baseRpc) }), solanaMainnet];
```

Breaking renames, with no aliases kept:

- `evm(...ids, opts)` is now `evm(id | definition, opts?)` and returns a single chain.
- `solanaChain(ref)` is now `solana(ref)`, and the `solana` mainnet constant is now `solanaMainnet`.
- `bitcoinChain(ref)` is now `bitcoin(ref)`, and the `bitcoin` mainnet constant is now `bitcoinMainnet`.
- `cosmosChain(ref)` is now `cosmos(ref)`; `cosmoshub` and `osmosis` are unchanged.

New capabilities:

- `evm()` accepts viem, wagmi, or AppKit chain definitions (`evm(mainnet)`, `config.chains.map((c) => evm(c))`). A definition's first default HTTP RPC URL becomes that chain's `read` transport; an explicit `{ read }` still overrides it, and bare numeric IDs never get an implicit transport.
- The non-EVM factories accept network definitions with a string `id`, such as AppKit's Solana and Bitcoin networks.
- `konekt/eip155` exports named chains for the most common networks and their testnets: `ethereumMainnet`, `ethereumSepolia`, `baseMainnet`, `baseSepolia`, `bscMainnet`, `bscTestnet`, `arbitrumMainnet`, `arbitrumSepolia`, `optimismMainnet`, `optimismSepolia`, `polygonMainnet`, `polygonAmoy`. Named chains carry no read transport.
