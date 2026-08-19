---
name: konekt
description: >
  Integrates konekt, a minimal WalletConnect v2 dapp provider. Use when adding WalletConnect,
  Provider.init, session pairing, chain adapters (evm, solana, bitcoin, cosmos), SIWE, CACAO,
  display_uri, or request_sent.
---

# konekt

Use `konekt` to connect a browser application to WalletConnect v2 wallets. It is ESM and has no
`@walletconnect` runtime dependency.

## Application entry

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";

const provider = await Provider.init({
  projectId,
  metadata: { name, description, url, icons: [] },
  chains: evm(1),
});

provider.on("display_uri", showPairingUri);
await provider.connect();
```

- Applications call `Provider.init(opts)`. It returns the process singleton; the first options win.
- Tests call `Provider.create(opts, deps?)`. It returns a new instance.
- Injecting `deps.session` must not open a relay socket.
- Do not add `createProvider()`.

## Chains

`chains` accepts `Chain` objects, not bare numbers. It flattens one array level, so both
`evm(1, 8453)` and `[evm(1), solana]` are valid.

| Import | What |
| --- | --- |
| `konekt/eip155` | `evm(...ids, { read? })` |
| `konekt/http` | `http(url)` for JSON-RPC reads |
| `konekt/solana` | `solana`, `solanaChain(ref)` |
| `konekt/bip122` | `bitcoin`, `bitcoinChain(ref)` |
| `konekt/cosmos` | `cosmoshub`, `osmosis`, `cosmosChain(ref)` |
| `konekt/generic` | `forwardingNamespace({ namespace, methods, events })` |

```ts
import { http } from "konekt/http";
chains: [evm(1, { read: http(rpcUrl) }), solana];
```

- Give networks separate `evm(id, { read })` calls when they use different RPC URLs.
- Wallet methods go to the wallet. Other `eth_*`, `net_*`, and `web3_*` methods use `read`.
- `request(args, chainId)` targets one configured CAIP-2 ID for that call without moving the active
  chain.
- There is no provider-level `rpcUrl`.

## viem

```ts
const transport = custom(provider);
const wallet = createWalletClient({ chain, transport });
```

Connect Konekt before requesting accounts. A viem public client can share the custom transport when
the EVM chain has `read`, or use viem's `http()` directly. For multiple chains, `custom(provider)`
uses the active EVM chain; a fixed read transport can call
`provider.request(args, "eip155:<id>")`.

## Bundle discipline

- Preserve subpath imports. Do not create a barrel that re-exports every adapter and feature.
- Omit `konekt/http` when viem or wagmi handles every public read.
- Keep `konekt/cacao` on the server that trusts the authentication result.
- To lazy-load the wallet stack, dynamically import `konekt`, its chain adapters, and any features
  before the first `Provider.init()` call. Later calls cannot add options to the singleton.
- Lazy initialization delays saved-session restoration. Initialize eagerly when the first render
  needs connected account state.
- The measured bundle table and React lazy-loading patterns are at
  `https://lsheva.github.io/konekt/guides/bundle-size/`.

## Features

```ts
import { siwe, cacaosOf } from "konekt/siwe";
features: [siwe({ domain: location.host, uri: location.origin, chains: ["eip155:1"], getNonce })];
```

Features are proposal hooks, not `request()` wrappers. `onProposal` may await a fresh nonce. If
`onSettle` throws, `connect()` rejects and disconnects the new session.

`konekt/siwe` asks for authentication and binds the answer to the browser session. The server that
makes the authentication decision must call both `verifyCacao()` and `checkClaims()` from
`konekt/cacao`, using a single-use server-issued nonce. Never authenticate from browser checks.

## Wallet events

- Register `display_uri` before `connect()` and render its temporary URI as a QR or wallet link.
- `request_sent` contains `{ id, topic, url }`. Application UI may open `url` when present.
- `formatWalletRedirect(href, id, topic)` builds a request redirect when the app already knows the
  wallet URL.
- Pass an `AbortSignal` to `connect()` and abort when the pairing UI closes.

For React UI, use `konekt-ui` or `konekt-ui/wagmi` and load the corresponding skill.

## Errors

- `4100` — no session; await `connect()` first.
- `4200` — missing EVM `read` transport or unsupported method.
- `-32602` — malformed method parameters.
