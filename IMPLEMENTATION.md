# Implementation Plan

Staged path from a throwaway protocol spike to the architecture in [PLAN.md](PLAN.md).

Two rules hold throughout:

1. **Every phase ends in something demonstrable.** Not "the crypto module is done" but "a real
   wallet signed a message". Exit criteria below are written so they can only be met by running
   something.
2. **Seams are extracted, not designed up front.** Phases 1 and 2 build a deliberately hardcoded
   EVM-only client. Phase 3 turns it into adapters and middleware, and the proof that the refactor
   was behaviour-preserving is that the Phase 1-2 tests pass unchanged. Designing the plugin
   interfaces before there is working code to generalise from is how the original ended up with
   `universal-provider` and `ethereum-provider` as separate packages that do the same job.

| Phase | Outcome | New LOC | Cumulative |
| --- | --- | --- | --- |
| 0 | Throwaway spike: real wallet signs a message | ~250 | — |
| 1 | Minimal EVM provider, hardcoded, in-memory | ~600 | ~600 |
| 2 | Production-usable: persistence, reconnect, events | ~250 | ~850 |
| 3 | Seams: middleware, chain adapters, features | ~150 | ~1000 |
| 4 | Packaging, tree shaking, compat entry | ~200 | ~1200 |
| 5 | Features: siwe, eip5792, verify | ~270 | ~1470 |
| 6 | Non-EVM adapters: solana, bip122 | ~100 | ~1570 |

---

## Phase 0 — Protocol spike

**Purpose:** discover everything the reference implementation does not document, before any
architecture exists to be invalidated by it. One file, hardcoded values, no abstractions, thrown
away afterwards (kept in `spikes/` for reference).

`spikes/handshake.ts` does, top to bottom: generate an ed25519 seed and sign the relay JWT, open
the socket, generate a pairing symKey and topic, print the `wc:` URI as a terminal QR code,
`irn_subscribe` the pairing topic, publish `wc_sessionPropose`, await the response, derive the
session topic, subscribe, receive and ack `wc_sessionSettle`, then send one `personal_sign`.

**Validates:** did:key multibase encoding, JWT claim shape, envelope byte layout, the
`sha256(symKeyBytes)` vs `sha256(hexString)` trap, HKDF parameters, tag and TTL correctness, and
handshake ordering — specifically that the settle can arrive before the propose-response handler
has finished subscribing.

**Answers the open protocol question:** whether the legacy `irn_subscribe` + `irn_publish(tag 1100)`
proposal path still settles on the production relay, and separately whether `wc_proposeSession`
behaves as assumed. Both get tried; the result is written into PLAN.md.

**Exit criteria**

- [ ] A real mobile wallet scans the QR and the session settles
- [ ] `personal_sign` returns a signature that `ecrecover`s to the wallet's address
- [ ] Both proposal-publish paths tried against the live relay, result recorded
- [ ] Deps confirmed: `@noble/ciphers`, `@noble/curves`, `@noble/hashes` and nothing else

---

## Phase 1 — Minimal EVM provider

**Purpose:** the smallest thing that deserves to be called a library. Hardcoded to `eip155`, no
plugin seams, no persistence, no reconnect, no features, no compat layer. Deliberately not general.

**Files**

- `src/kernel/crypto.ts`, `src/kernel/jwt.ts`, `src/kernel/uri.ts` — lifted from the spike, tidied
- `src/kernel/emitter.ts` — ~30 line typed emitter, no `events` polyfill
- `src/kernel/relay.ts` — socket, `irn_publish`, `irn_subscribe`, inbound `irn_subscription` with
  its mandatory `result: true` ack
- `src/kernel/session.ts` — handshake, `wc_sessionRequest` with id matching
- `src/index.ts` — `createProvider`, EIP-1193 surface, `eth_accounts` / `eth_chainId` answered
  locally from the session, signing methods forwarded to the wallet
- `test/relay-server.ts` — ~100 line `ws` server implementing the three relay methods
- `test/interop.spec.ts` — real `@walletconnect/sign-client` as the wallet peer

The local relay is what makes everything after this cheap: deterministic, no projectId, no network,
and interop is proven against the reference implementation rather than against our own assumptions.

**Exit criteria**

- [ ] Interop suite green: handshake, `personal_sign`, `eth_sendTransaction`, `eth_accounts`
- [ ] `new ethers.BrowserProvider(provider)` signs a message and sends a transaction against Hardhat
- [ ] Crypto parity vectors green against `@walletconnect/utils` and `@walletconnect/relay-auth`
- [ ] Live-relay smoke test passes when `WC_PROJECT_ID` is set, skips cleanly when it is not
- [ ] Known gap, asserted as a failing-by-design test: page reload loses the session

---

## Phase 2 — Production-usable

**Purpose:** everything that separates a demo from something you would ship. All of it kernel-level,
because every consumer needs it.

- **Persistence** — `src/kernel/storage.ts`, a pluggable async KV defaulting to localStorage.
  Persist exactly two things: the keychain (ed25519 seed, `topic -> symKey`) and the session record.
  Restore path: read session, look up its symKey, open socket, subscribe. `storage: null` gives an
  in-memory keychain, which is also the sessionless / QR-per-signature mode.
- **Reconnect** — 5s liveness pulse gated on `document.visibilityState`, `online`/`offline`
  listeners, re-subscribe before declaring the connection up, treat close code 3000 as fatal rather
  than retrying into a hot loop.
- **Dedupe** — bounded in-memory set of inbound message hashes. Delivery is at-least-once; without
  this every event fires twice.
- **Inbound session traffic** — `wc_sessionEvent` (`chainChanged`, `accountsChanged`),
  `wc_sessionUpdate`, `wc_sessionExtend`, `wc_sessionDelete`, `wc_sessionPing`, including the
  out-of-sync id guard that compares all but the last three digits of the payload id.
- **Request expiry** — local timeout, `request.expiryTimestamp` in the payload, relay TTL, and
  failing all in-flight requests when the peer disconnects.
- **Wallet redirect** — from `session.peer.metadata.redirect`, honouring `disableDeepLink`,
  skipping when `document.hasFocus()` is false, Telegram `startapp` special case.
- **`onDebug`** — kernel-internal observability hook.

**Exit criteria**

- [ ] Reload restores the session and `eth_accounts` still answers
- [ ] Killing the socket reconnects and re-subscribes without losing inbound messages
- [ ] Wallet-initiated chain switch, account change and disconnect surface as EIP-1193 events
- [ ] A duplicated inbound message emits once
- [ ] An expired request rejects rather than hanging forever

---

## Phase 3 — Extract the seams

**Purpose:** turn the hardcoded EVM client into the pluggable one, changing no behaviour.

- `src/kernel/provider.ts` — middleware pipeline, hook dispatch, adapter extension merging
- `src/chains/eip155.ts` — the EVM logic moved out of `src/index.ts` behind `ChainAdapter`
- `Chain` / `ChainAdapter` / `Feature` / `Middleware` types, `evm(...ids)` factory
- Typed extension inference over the `chains` tuple, so `provider.chainId` exists only when an EVM
  chain is configured
- A throwaway stub adapter for a fake namespace, proving requests route by namespace

**Exit criteria**

- [ ] Every Phase 1-2 test passes **unchanged** — this is the whole point of the phase
- [ ] The stub adapter receives its own namespace's requests and nothing else
- [ ] `provider.chainId` is a type error when only the stub adapter is configured

---

## Phase 4 — Packaging and compat

**Purpose:** make the tree shaking real and prove API compatibility.

- ESM-only build, `tsc` with preserved module structure, `sideEffects: false`
- Subpath exports: `.`, `./eip155`, `./solana`, `./bip122`, `./cosmos`, `./generic`, `./siwe`,
  `./cacao`, `./eip5792`, `./verify`, `./ethereum-provider`
- `size-limit` budgets in CI: kernel + EVM <= 15 kB gz, each feature <= 3 kB gz
- `publint` and `attw` in CI
- `src/http.ts` — the opt-in HTTP read transport, its own module so it shakes out
- `src/compat/ethereum-provider.ts` — `EthereumProvider.init`, byte-identical constant arrays, the
  four non-standard properties (`session`, `accounts`, `chainId` as decimal, `signer`), an `events`
  object exposing `setMaxListeners` as a no-op, `showQrModal: true` throwing with a pointer to
  `display_uri`, reads always enabled
- `src/wagmi.ts` — native wagmi 3 connector on `createProvider`, `id: 'walletConnect'` so persisted
  `wagmi.recentConnectorId` still matches. The non-WalletConnect work is `isChainsStale` /
  `getRequestedChainsIds` in `config.storage`, and `switchChain` racing a `config.emitter` `change`
  listener against the RPC call with `wallet_addEthereumChain` fallback. `@wagmi/core` peer dep.

`~/Dev/titan/test-wagmi-v3` (`wagmi@3.7.6`, `@wagmi/connectors@8.1.0`, `vite-bundle-analyzer`
already wired) is the acceptance harness for both routes and gives a measured bundle delta rather
than a size-limit estimate.

**Exit criteria**

- [ ] A bundle importing only `.` and `./eip155` contains no SIWE, no HTTP client, no compat code
- [ ] Size budgets met; `publint` and `attw` clean
- [ ] Ported upstream tests pass against the compat entry: ethers, web3, and the two persistence
      cases (nested `eip155` and inline `eip155:31337` namespace keys)
- [ ] test-wagmi-v3 connects, signs and switches chains via the alias route
      (`resolve.alias` + `showQrModal: false`, wagmi's own connector)
- [ ] test-wagmi-v3 does the same via `konekt/wagmi`, with no compat shim in the bundle
- [ ] Bundle delta measured against the existing `bundle-report.json` baseline

---

## Phase 5 — Features

Each is independent and lands separately.

- **`siwe`** (done) — split in two, because the browser is not a trust boundary. `konekt/siwe` puts
  `requests.authentication` on the proposal and binds what comes back to the session: nonce, domain
  and `aud` must echo, and the CACAO issuer must be an account the session actually granted, which
  is the one check a backend cannot make because it never sees the session. `konekt/cacao` does the
  EIP-4361 reconstruction and signature verification, DOM-free so a server can import it; the
  reference SDK verifies nowhere on this path, so that is where the security value sits. Statements
  containing `\r` or `\n` are rejected. Recaps are refused rather than half-supported, since the
  statement rewrite they require is not reconstructed.
  **Wire format is source-derived.** `requests.authentication` and `proposalRequestsResponses` appear
  nowhere in the published specs — only in monorepo source shipped around June 2026. The interop test
  proves our framing against a real `@walletconnect/sign-client` peer, not that any mobile wallet
  implements it.
  **Decision point, still open:** if real wallets ignore the proposal-embedded flow, the fallback is
  either the deprecated `wc_sessionAuthenticate` path as `./siwe/legacy` — second keypair, hashed
  response topic, type-1 envelope decode, recap-to-namespace synthesis — or simply `connect()` then
  `personal_sign`, which is app code needing no library support and reuses `konekt/cacao` unchanged.
  Prefer the second unless one prompt is worth the first.
- **`eip5792`** — `wallet_sendCalls`, `wallet_getCallsStatus` with local status reconstruction from
  stored transaction hashes, `wallet_getCapabilities` with `sessionProperties` / `scopedProperties`
  extraction and caching.
- **`verify`** — attestation iframe, 5s abort, empty string on failure.

**Exit criteria**

- [x] A tampered CACAO signature is rejected by `konekt/cacao`, and `formatCacaoMessage` is
      asserted byte-identical to `@walletconnect/utils` so the reconstruction cannot drift
- [ ] Each feature's absence from a bundle is asserted by a size-limit entry
- [ ] `wallet_getCallsStatus` reconstructs from receipts when the wallet does not implement it

---

## Phase 6 — Non-EVM

`src/chains/solana.ts` and `src/chains/bip122.ts`: forward-everything adapters, named network
constants, plus a `solanaChain(reference)` style factory each. Methods and mainnet CAIP-2 ids come
from WalletConnect Wallet SDK docs and the 2.23.10 monorepo. Unlisted networks use the factory.

**Exit criteria**

- [x] An interop test settles one session spanning `eip155` + `solana` and routes a request to each
- [x] Method lists checked against WalletConnect Wallet SDK docs, not against memory

---

## Decision points

Each is deliberately deferred to the phase that has evidence to settle it.

| Question | Settled in | How |
| --- | --- | --- |
| Legacy proposal publish vs `wc_proposeSession` | 0 | Try both against the production relay |
| Whether the relay requires the `auth` JWT | 0 | Omit it and observe the close code |
| SIWE modern flow vs deprecated `authenticate()` | 5 | Test the modern flow against real wallets first |
| Whether `verify` attestation is worth shipping | 5 | Observe how wallets render an unverified origin |
| Verified-response link mode | post-v1 | Only with a measured latency win; see PLAN.md risks |

## Deliberately not in any phase

Modal and wallet picker UI, vendor analytics (`eventClient`, TVF), echo push registration, link
mode, persistent history and expirer stores, the pairing controller, batch relay RPCs, React Native,
CJS output, and wallet-side APIs. Rationale for each is in [PLAN.md](PLAN.md).
