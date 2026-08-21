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
import { ethereumMainnet } from "konekt/eip155";

const provider = await Provider.init({
  projectId,
  metadata: { name, description, url, icons: [] },
  chains: [ethereumMainnet],
});

provider.on("display_uri", showPairingUri);
await provider.connect();
```

- Applications call `Provider.init(opts)`. It returns the process singleton; the first options win.
- Tests call `Provider.create(opts, deps?)`. It returns a new instance.
- Injecting `deps.session` must not open a relay socket.
- Do not add `createProvider()`.

## Chains

`chains` accepts `Chain` objects, not bare numbers. Each factory call creates one chain, so
`[ethereumMainnet, evm(8453)]` and `[ethereumMainnet, solanaMainnet]` are valid.

| Import | What |
| --- | --- |
| `konekt/eip155` | `evm(id | definition, { read? })`, named chains such as `ethereumMainnet` |
| `konekt/http` | `http(url)` for JSON-RPC reads |
| `konekt/solana` | `solanaMainnet`, `solanaDevnet`, `solanaTestnet`, `solana(ref)` |
| `konekt/bip122` | `bitcoinMainnet`, `bitcoinTestnet`, `bitcoinSignet`, `bitcoin(ref)` |
| `konekt/cosmos` | `cosmoshub`, `osmosis`, `cosmos(ref)` |
| `konekt/generic` | `forwardingNamespace({ namespace, methods, events })` |

`evm()` also accepts viem, wagmi, or AppKit chain definitions (`evm(mainnet)`); the definition's
first default HTTP RPC URL becomes that chain's `read`. The non-EVM factories accept definitions
with a string `id` the same way.

```ts
import { http } from "konekt/http";
chains: [evm(1, { read: http(rpcUrl) }), solanaMainnet];
```

- Each `evm()` call creates one chain, so networks with different RPC URLs are separate calls.
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

## ethers

```ts
const ethersProvider = new BrowserProvider(provider);
const signer = await ethersProvider.getSigner();
```

Connect Konekt before `getSigner()`. Configure `evm(id, { read: http(url) })` when ethers will send
JSON-RPC reads through the provider. Listen for `accountsChanged`, `chainChanged`, and `disconnect`
on the Konekt provider.

## Solana and CosmJS

Do not add `konekt/solana-client` or `konekt/cosmjs`. Copy the application-owned bridges from
https://github.com/lsheva/konekt/tree/main/packages/integrations/src.

- Solana messages are base58; transactions are base64. Support legacy and versioned transactions.
- CosmJS Amino and direct signers must be separate objects. Direct `accountNumber` is a decimal
  string on the wire; `bodyBytes` / `authInfoBytes` are base64. Call `cosmos_getAccounts` for pubkey.

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
