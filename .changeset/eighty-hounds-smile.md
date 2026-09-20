---
"konekt": patch
---

Keep the active EVM chain inside the configured chains.

A wallet settles and updates session namespaces verbatim, so it can approve chains that were never
proposed and announce `chainChanged` for them. The EVM adapter adopted those chains, which left
`provider.chainId` on a network the app never configured: wagmi's `getConnectorClient` then failed
its chain assertion and `useWalletClient()` returned `undefined` until a reload.

The active chain now moves only to a chain that is both configured and approved. Settlement,
restore, `chainChanged`, `wc_sessionUpdate`, and `wallet_switchEthereumChain` all use that rule, so
a live session and a reloaded one agree. A `chainChanged` for an unconfigured chain still reaches
listeners, and `wallet_switchEthereumChain` for one now fails with `-32602`. `provider.accounts` is
scoped to the configured chains for the same reason.
