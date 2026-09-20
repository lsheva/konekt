# konekt

## 0.2.1

### Patch Changes

- 7ea33a4: Keep the active EVM chain inside the configured chains.
  
  A wallet settles and updates session namespaces verbatim, so it can approve chains that were never
  proposed and announce `chainChanged` for them. The EVM adapter adopted those chains, which left
  `provider.chainId` on a network the app never configured: wagmi's `getConnectorClient` then failed
  its chain assertion and `useWalletClient()` returned `undefined` until a reload.
  
  The active chain now moves only to a chain that is both configured and approved. Settlement,
  restore, `chainChanged`, `wc_sessionUpdate`, and `wallet_switchEthereumChain` all use that rule, so
  a live session and a reloaded one agree. A `chainChanged` for an unconfigured chain still reaches
  listeners, and `wallet_switchEthereumChain` for one now fails with `-32602`. `provider.accounts` is
  scoped to the configured chains for the same reason.

## 0.2.0

### Minor Changes

- 43a38ba: Rework the chain adapter exports into one symmetric shape per module. Every factory call creates exactly one chain, so options such as `read` can never leak across networks:
  
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
- f9a7186: `Provider` now exposes the WalletConnect Cloud project ID it was configured with as a readonly `projectId` property, so UI layers can reuse it without carrying the value separately.

## 0.1.1

### Patch Changes

- eb616db: Publish the expanded package READMEs, extra npm keywords, and CHANGELOG.md in the tarball.
