# Agent code requirements

pnpm workspace. The library lives in `packages/konekt` (package name `konekt`). The slim wagmi app is `packages/example`. The capabilities showcase is `packages/showcase`. Kernel files below live under `packages/konekt/src/kernel/`. Chain adapters live under `packages/konekt/src/chains/` (`konekt/eip155`, `konekt/solana`, `konekt/bip122`). The HTTP read transport is `packages/konekt/src/http.ts` (`konekt/http`). The kernel barrel does not import adapters or HTTP.

This is a small TypeScript ESM library (`strict`, `exactOptionalPropertyTypes`, Biome). Prefer names and structure over comments. Do not add wrapper APIs that duplicate an existing one.

## Public API

- Apps: `Provider.init(opts)` — process singleton, sensible defaults (relay URL, storage).
- Tests: `Provider.create(opts, deps?)` — a new instance every time. Inject `relay`, `session`, `seed`, or `storage` to swap internals. Do not open a real socket when `session` is injected.
- Do not add `createProvider()` or any function that only forwards to a static method.
- Chains are `Chain` objects from adapters you import: `chains: [ethereumMainnet, evm(8453)]` or `chains: [ethereumMainnet, stub]`. Factories create one chain per call; the kernel flattens one level. Do not pass numeric chain ids.
- Features are optional hook objects on `features: [siwe(...)]`. They do not wrap `request()`. The seam is symmetric: a feature writes its own key under `Proposal.requests` and reads the matching key back off `Session.proposalRequestsResponses`. The kernel carries both containers without reading either, so adding a feature is not a kernel change.
- `onProposal` is awaited before the proposal is published, so a feature may fetch a nonce. `onSettle` throwing rejects `connect()` and tears the session down; do not leave a settled session behind a failed connect.
- Verification is not the browser's job. `konekt/siwe` asks for authentication and binds the answer to the session; `konekt/cacao` verifies signatures and is meant for the server that trusts the result.
- Wallet UI is events, not side effects. `display_uri` is the pairing QR; `request_sent` is a session request (`id`, `topic`, and `url` when the wallet advertised a redirect). The app opens the wallet. `formatWalletRedirect` builds the URL if the app already has the href.

## Where code lives

Put a helper next to the concern it belongs to, not in the composer:

| Kind | Home |
| --- | --- |
| Wire protocol (`Session`, `TAG`, `TTL`, CAIP-10 parsing) | `types.ts` |
| EIP-1193 class, its events, its options | `provider.ts` |
| Plugin contracts (`Chain`, `ChainAdapter`, `Feature`, `Ctx`, `resolveChainId`) | `plugin.ts` |
| EVM (chain id hex, CAIP accounts, method routing, `evm()`) | `chains/eip155.ts` |
| Forward-everything namespaces (`forwardingNamespace`) | `chains/generic.ts` |
| Solana (`solana` / `solanaMainnet`) | `chains/solana.ts` |
| Bitcoin (`bitcoin` / `bitcoinMainnet`) | `chains/bip122.ts` |
| Cosmos (`cosmos` / `cosmoshub` / `osmosis`) | `chains/cosmos.ts` |
| One-click auth request and session binding (`siwe`, `cacaosOf`) | `features/siwe.ts` |
| CACAO message format and signature verification | `features/cacao.ts` |
| JSON-RPC HTTP read transport | `http.ts` |
| Relay auth seed | `storage.ts` (`STORE.seed`) |
| JWT lifetime | `jwt.ts` (`JWT_TTL`) |
| Authenticated socket | `relay.ts` (`openRelay`, `RelayClient`) |
| Session handshake | `session.ts` (`SessionClient`; defines `Relay`) |

The kernel does not import chain adapters or `http`. Apps load them with `import { evm } from "konekt/eip155"` (or `await import(...)` when they want to defer). Reads are `evm(1, { read: http(url) })`, not a provider `rpcUrl`.

## Control flow

- Async work (`loadSeed`, `restore`) stays in `init` / `create`. Constructors stay synchronous.
- Split injected vs constructed paths with an early return. Do not collapse them into `x!` or `x ?? (cond ? undefined : build())`.
- `Provider.request` walks each adapter `handle`. A defined return is the result; `undefined` means not this adapter. Nobody claims it → 4200.
- Local EIP-1193 answers are a `switch` inside the EVM adapter. Leftovers go through `routeMethod()` (`wallet` | `rpc` | `unknown`). Check wallet first so `personal_sign` is not treated as an HTTP read.
- `wallet_switchEthereumChain`: handle locally when the chain is already in the session, then forward to the wallet. Do not special-case the method in two sets.
- Adapter `read` is only JSON-RPC reads (`eth_` / `net_` / `web3_` after wallet routing). It is not a passthrough for every leftover method.
- Every namespace picks its chain with `resolveChainId`: an explicitly targeted chain, then the active one, then the first configured. `request(args, chainId)` targets one call without moving the active chain. Do not re-derive this rule per adapter.
- Non-EVM namespaces are `forwardingNamespace({ namespace, methods, events })`, not hand-written adapters. `eip155` is the exception because it has local answers, a `read` transport, and `extend`.
- Session-to-EIP-1193 mapping lives on the adapter (`onEvent` / `onSettle` / `extend`). Provider dispatches session events to adapters and emits kernel `connect` / `disconnect`. Features get `onProposal` / `onSettle` / `onDisconnect` only.

## Types and assertions

- `exactOptionalPropertyTypes` is on. Optional fields you pass through must be `T | undefined`. Do not write `...(x ? { x } : {})`.
- `request` `params` are `unknown`. Parse them (see `parseSwitchChainId`). Do not `as` a shape and `!` an index.
- Do not use `!` to satisfy the type checker. Narrow, early-return, or widen the helper to the data it actually reads (`parseAccounts` takes `{ namespaces }`, not a full `Session`).
- Named constants instead of magic numbers: `RpcErrorCode`, `JWT_TTL`, `DEFAULT_RELAY_URL`, `routes`.
- Consumer ports live with the consumer. Session defines `Relay`. Provider's injected `session` is a `Pick` of `SessionClient`. Neither class `implements` its consumer port.
- Adapter `extend()` is how `provider.chainId` / `provider.accounts` exist. They are a type error when no EVM chain is configured.

## Errors

EIP-1193 / JSON-RPC codes live in `RpcErrorCode`. Messages say what is missing and what to do:

- **4100 unauthorized** — no session; caller must `connect()` first. Not a config bug, not an invariant after a successful `connect()`.
- **4200 + rpc route** — JSON-RPC read without a `read` transport on the chain.
- **4200 + unknown route** — method is not supported.
- **-32602** — malformed params.

## Names

A short name that hides the rule is worse than a table. Prefer `routeMethod` + `routes.wallet` / `routes.rpc` over `classify` + a comment. Prefer `openRelay` over inlining `formatRelayUrl(signJwt(...))`. Prefer `handle` over middleware/`next()`.
