---
title: For AI agents
description: Implementation rules and source links for coding assistants that integrate konekt.
---

You are integrating **konekt**, a small browser client for WalletConnect v2. Use the public APIs below as written. Do not invent aliases or wrapper APIs that duplicate them.

## Read in this order

1. This page.
2. [`/skills/konekt/SKILL.md`](/skills/konekt/SKILL.md) for provider, chain, request, and authentication code.
3. [`/skills/konekt-ui/SKILL.md`](/skills/konekt-ui/SKILL.md) for React wallet UI.
4. [`/llms-full.txt`](/llms-full.txt) when you need all human-facing guides in one document.
5. Generated `/api/` pages only when you need the exact type of a specific export.

## Minimal browser integration

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";

const provider = await Provider.init({
  projectId,
  metadata: { name, description, url, icons },
  chains: evm(1),
});

provider.on("display_uri", showPairingUri);
await provider.connect();
```

## Public API

- Application code calls `Provider.init(opts)`. It returns the process singleton and uses the default relay URL and storage unless configured otherwise.
- Tests call `Provider.create(opts, deps?)`. It returns a new instance. Inject `relay`, `session`, `seed`, or `storage` to replace internals. A supplied `session` must not cause a real socket to open.
- Do not add `createProvider()` or any function that only forwards to a static method.

## Chains

- Import each adapter from its subpath: `konekt/eip155`, `konekt/solana`, `konekt/bip122`, `konekt/cosmos`, or `konekt/generic`.
- `chains` accepts `Chain` objects. Valid examples are `evm(1, 8453)` and `[evm(1), solana]`. The provider flattens one array level. Never pass numeric IDs directly as `chains`.
- Configure EVM JSON-RPC reads with `evm(1, { read: http(url) })`, importing `http` from `konekt/http`. There is no provider-level `rpcUrl`.
- Give each EVM network its own `evm(id, { read })` call when its RPC URL differs.
- `provider.request(args, chainId)` targets one configured CAIP-2 chain for that call and does not move the active chain.
- Wallet methods go to the wallet. EVM `eth_*`, `net_*`, and `web3_*` reads use `read` only after wallet methods have been classified.

## Features

- Add features as `features: [siwe(...)]`. Features are connection hooks, not wrappers around `request()`.
- A feature writes its own key under `Proposal.requests` and reads the matching key from `Session.proposalRequestsResponses`.
- `onProposal` is awaited before publication, so fetch a fresh nonce there.
- If `onSettle` throws, `connect()` rejects and the provider disconnects the settled session.
- Browser code uses `konekt/siwe` to request authentication and bind the returned account to the session.
- Server code uses both `verifyCacao()` and `checkClaims()` from `konekt/cacao`. A signature check without domain, URI, nonce, and time checks is incomplete.
- Never make an authentication decision in the browser.

## Integrations

- viem: pass the connected EVM provider to `custom(provider)`. Wallet clients use Konekt; public clients either use the same custom transport with an EVM `read` transport or viem’s own `http()`.
- wagmi 3: use an application-owned connector around the Konekt provider. Register it in `createConfig()` and let its `getProvider` initialize Konekt lazily. Wagmi HTTP transports handle reads.
- Do not use wagmi private `_internal` APIs for connector registration.
- Read `/guides/viem/` or `/guides/wagmi/` before generating integration code.

## Bundle discipline

- Preserve the public entry-point boundaries. Do not create an application barrel that re-exports every Konekt adapter and feature.
- Omit `konekt/http` when viem or wagmi already owns all public reads.
- Import `konekt/cacao` only in trusted server code.
- To lazy-load Konekt, dynamically import the provider, chains, and features together before the first `Provider.init()` call. Later calls cannot add options to the singleton.
- A wagmi connector may remain statically registered while its `getProvider()` dynamically imports Konekt.
- Read `/guides/bundle-size/` for measured sizes and complete lazy-loading examples.

## Wallet UI

- Konekt reports UI work through events. It must not unexpectedly navigate or render.
- `display_uri` carries the temporary pairing URI. Register the listener before `connect()`.
- `request_sent` carries `{ id, topic, url }`; the app may open `url` when present.
- `formatWalletRedirect(href, id, topic)` builds a request redirect when the app already knows the wallet URL.
- For React without wagmi, use `WalletModal` with `useProviderPairing` from `konekt-ui`.
- For an existing wagmi integration, use `ConnectButton` or `useWagmiPairing` from `konekt-ui/wagmi`.
- Import `konekt-ui/styles.css` unless the component is intentionally `unstyled`.

## Errors

- `4100` means there is no session; await `connect()` first.
- `4200` means an EVM read has no `read` transport or the method is unsupported.
- `-32602` means request parameters are malformed.

## Completion checklist

- Listen for the pairing URI before starting a connection.
- Cancel pending pairing when its UI closes.
- Configure chain objects, not bare IDs.
- Keep wallet writes and HTTP reads on their intended routes.
- Keep server verification modules out of the browser bundle.
- Open wallet URLs in application UI code.
- Verify authentication on the server with a single-use nonce and both CACAO checks.
