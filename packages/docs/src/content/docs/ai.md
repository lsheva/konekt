---
title: For AI agents
description: Reading order, non-negotiable rules, and a map from task to page for coding assistants that integrate konekt.
---

You are integrating **konekt**, a small browser client for WalletConnect v2. This page is a router: it lists the rules that are easy to get wrong and points at the one page that documents each task. Everything else is written once, somewhere else, so the two cannot drift apart.

## Read in this order

1. This page.
2. [`skills/konekt/SKILL.md`](../skills/konekt/SKILL.md) — provider, chains, requests, features, wallet events.
3. [`skills/konekt-ui/SKILL.md`](../skills/konekt-ui/SKILL.md) — React wallet UI.
4. The guide for the task you were given, from the map below.
5. [`llms-full.txt`](../llms-full.txt) when you need every human-facing guide in one document.
6. Generated [API pages](../api/readme/) when you need the exact type of a specific export.

## Non-negotiable rules

These are the mistakes that compile, run, and then fail in production or leak. Check every generated integration against them.

- Applications call `Provider.init(opts)`; it returns a process singleton and the first options win. Tests call `Provider.create(opts, deps?)`. Do not add `createProvider()` or any function that only forwards to a static method.
- `chains` takes `Chain` objects from adapter subpaths (`evm(1, 8453)`, `[evm(1), solana]`), never bare numeric IDs, and there is no provider-level `rpcUrl`.
- JSON-RPC reads need an explicit `read` transport on the chain: `evm(1, { read: http(url) })`. Without one, a read throws `4200` rather than falling back to a public node.
- Features are proposal hooks, not wrappers around `request()`. A feature writes its key under `Proposal.requests` and reads the matching key back from `Session.proposalRequestsResponses`.
- Never make an authentication decision in the browser. `konekt/siwe` asks and binds; the server calls both `verifyCacao()` and `checkClaims()` from `konekt/cacao` with a single-use nonce it issued.
- Keep `konekt/cacao` out of browser bundles, and keep subpath imports intact instead of re-exporting adapters and features through an application barrel.
- Konekt reports UI work through events. Register `display_uri` before `connect()`, and let application code — not the library — open wallet URLs.
- Do not add `konekt/solana-client` or `konekt/cosmjs`. Solana and CosmJS use application-owned bridges copied into the app.

## Where each task is documented

| Task | Page |
| --- | --- |
| First provider, first connection | [Getting started](../guides/getting-started/) |
| Chain adapters, read transports, targeting one chain | [Chains and networks](../guides/chains/) |
| `Provider.init` options, persistence, expiry, disconnect | [Sessions and options](../guides/sessions/) |
| SIWE, CACAO verification, custom features | [Authentication](../guides/features/) |
| Pairing URI, wallet redirects, cancelling a connection | [Wallet UI](../guides/wallet-ui/) |
| `WalletModal`, `ConnectButton`, pairing hooks | [konekt-ui](../guides/konekt-ui/) |
| Next.js, Vite, SSR, client-only initialization | [Frameworks and SSR](../guides/frameworks/) |
| Measured sizes, lazy loading, entry-point choice | [Bundle size and loading](../guides/bundle-size/) |
| Error codes and thrown messages | [Troubleshooting](../guides/troubleshooting/) |
| viem, ethers, wagmi | [viem](../guides/viem/), [ethers](../guides/ethers/), [wagmi](../guides/wagmi/) |
| Solana, Bitcoin, CosmJS | [Solana](../guides/solana/), [Bitcoin](../guides/bitcoin/), [CosmJS](../guides/cosmjs/) |
| Replacing `@walletconnect/ethereum-provider` | [Migration guide](../guides/migrate-ethereum-provider/) |

Read the matching page before generating code for that task. Do not infer an API from a neighbouring guide.

## Completion checklist

- The `display_uri` listener is registered before `connect()`, and pairing is aborted when its UI closes.
- Chains are adapter objects, and every network that needs reads has its own `read` transport.
- Wallet writes go to the wallet; `eth_*`, `net_*`, and `web3_*` reads go to `read`.
- Server verification modules are absent from the browser bundle.
- Authentication is decided on the server, with a single-use nonce and both CACAO checks.
- Wallet URLs are opened by application UI code.
