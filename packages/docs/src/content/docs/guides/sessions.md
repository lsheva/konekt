---
title: Sessions and provider options
description: Configure storage, the relay URL, protocol lifetimes, and diagnostics, and understand how a session is restored, expires, and ends.
---

[Getting started](../getting-started/) uses the three required options. This guide covers the rest of `Provider.init()` and what happens to a session between page loads.

## All provider options

| Option | Required | Default | Purpose |
| --- | --- | --- | --- |
| `projectId` | Yes | — | Authenticates your app to the WalletConnect relay. |
| `metadata` | Yes | — | Name, description, URL, and icons the wallet shows during approval. |
| `chains` | Yes | — | `Chain` objects from adapters. See [Chains and networks](../chains/). |
| `features` | No | none | Proposal hooks such as `siwe()`. See [Authentication](../features/). |
| `relayUrl` | No | `wss://relay.walletconnect.org` | Alternative relay WebSocket URL. |
| `storage` | No | `localStorage` in a browser | Where the relay identity and session are persisted. `null` disables persistence. |
| `ttl` | No | See [Protocol lifetimes](#protocol-lifetimes) | Overrides individual protocol timeouts, in seconds. |
| `onDebug` | No | none | Receives structured protocol diagnostics. |

`Provider.init()` is a process singleton. The first call fixes every option above; later calls return the same provider and ignore new options. Add every chain and feature your app can ever need to that first call.

## What is stored, and where

Konekt persists three keys so a session survives a page reload:

| Key | Contents |
| --- | --- |
| `konekt:seed` | The 32-byte seed that derives your app’s relay identity. Stable across sessions. |
| `konekt:keys` | Symmetric keys for the pairing and session topics. |
| `konekt:session` | The approved session, including its namespaces and expiry. |

These are connection secrets. Anything that can read them can send requests as your app for the life of the session, so keep them out of logs and error reports.

### Choose a different store

`storage` accepts any object with async `getItem`, `setItem`, and `removeItem`:

```ts
import { Provider } from "konekt";
import { ethereumMainnet } from "konekt/eip155";

const provider = await Provider.init({
  projectId,
  metadata,
  chains: [ethereumMainnet],
  storage: {
    getItem: async (key) => sessionStorage.getItem(key),
    setItem: async (key, value) => sessionStorage.setItem(key, value),
    removeItem: async (key) => sessionStorage.removeItem(key),
  },
});
```

Two shortcuts cover the common cases:

- `storage: null` disables persistence. Every page load starts from a fresh pairing, and nothing is written to the browser.
- `memoryStorage()` from `konekt` gives an isolated in-memory store, which is what tests usually want.

Outside a browser, where `localStorage` does not exist, Konekt falls back to memory storage. Sessions then last only as long as the process.

## Restoring a session

`Provider.init()` reads the stored session before it resolves. When one exists, the returned provider is already connected: `provider.connected` is `true`, the EVM adapter has populated `accounts` and `chainId`, and no `display_uri` is emitted.

```ts
const provider = await Provider.init({ projectId, metadata, chains: [ethereumMainnet] });

if (provider.connected) {
  showAccount(provider.accounts[0]);
} else {
  showConnectButton();
}
```

This is why a connect button should check `provider.connected` before calling `connect()`. Calling `connect()` on a restored session starts a second pairing the user does not need.

:::caution[Check the expiry yourself]
Konekt restores a stored session without comparing `session.expiry` to the current time, so an expired session can come back as `connected`. The first wallet request then fails. If your UI depends on the session being usable, check it after `init()`:

```ts
const expiry = provider.session?.expiry;
if (expiry && expiry * 1000 < Date.now()) {
  await provider.disconnect();
}
```
:::

## Ending a session

`provider.disconnect()` tells the wallet, clears the stored session, closes the relay socket, and emits `disconnect`. The wallet can also end the session on its side, which emits the same event.

```ts
provider.on("disconnect", ({ code, message }) => {
  clearWalletState();
});
```

Use `disconnect` as the single place that clears connected state, so wallet-initiated and app-initiated endings take the same path.

:::caution[Reconnecting needs a new provider]
`disconnect()` closes that provider’s relay client for good. A later `connect()` on the same instance emits `display_uri`, then rejects with `relay closed` instead of pairing, so the QR appears and immediately fails.

Because `Provider.init()` always returns the same singleton, a page offering disconnect followed by reconnect should either reload after disconnecting, or manage its own instance with `Provider.create()` and build a fresh one for the next connection:

```ts
let provider = await Provider.create({ projectId, metadata, chains: [ethereumMainnet] });

async function disconnect() {
  await provider.disconnect();
  provider = await Provider.create({ projectId, metadata, chains: [ethereumMainnet] });
}
```

Re-register your event listeners on the new instance.
:::

## Staying connected

The relay client keeps itself alive while a session exists:

- a dropped socket is retried every 5 seconds;
- retries pause while the document is hidden and resume on `visibilitychange`;
- a retry is also triggered by the browser’s `online` event;
- pending requests reject with `relay closed` when the socket drops, so surface a retry rather than waiting forever.

One failure is not retried. If the relay rejects your credentials it closes with code 3000, and Konekt marks the connection fatal and reports `relay rejected auth`. That almost always means an invalid or unauthorized `projectId`. See [Troubleshooting](../troubleshooting/).

## Protocol lifetimes

`ttl` overrides WalletConnect timeouts, in seconds. Omitted fields keep their defaults:

| Field | Default | Effect |
| --- | --- | --- |
| `propose` | 300 (5 minutes) | How long a pairing QR stays valid. `connect()` rejects with `proposal expired` afterwards. |
| `request` | 900 (15 minutes) | How long the wallet has to answer. The request rejects with `request expired` afterwards. |
| `session` | 86400 (24 hours) | Lifetime of a settled session. |
| `minPublish` | 300 | Minimum relay storage window for a published message. |

```ts
const provider = await Provider.init({
  projectId,
  metadata,
  chains: [ethereumMainnet],
  ttl: { propose: 120 },
});
```

Shortening `propose` makes an abandoned QR expire sooner. Shortening `request` gives up on a wallet faster, at the cost of failing users who take their time approving.

## Diagnostics

`onDebug` receives structured events describing relay and protocol progress. Payload contents are never included, so it is safe to record shapes and timings:

```ts
const provider = await Provider.init({
  projectId,
  metadata,
  chains: [ethereumMainnet],
  onDebug: (event) => {
    if (event.type === "error") reportError(event.error);
  },
});
```

| Event | Meaning |
| --- | --- |
| `socket_open` | The relay socket opened. |
| `socket_close` | The socket closed, with `code` and `reason`. |
| `publish` | A message was published to a `topic`. |
| `inbound` | A message arrived on a `topic`. |
| `settle` | The wallet approved the session. |
| `error` | A relay or protocol error, as a string. |

For local work, setting the `WC_DEBUG=1` environment variable prints a truncated protocol trace to the console. That is a development aid; use `onDebug` in production.

## Testing without a relay

`Provider.create()` returns a new instance every time instead of the singleton, and accepts injected dependencies:

```ts
import { Provider, memoryStorage } from "konekt";
import { ethereumMainnet } from "konekt/eip155";

const provider = await Provider.create(
  { projectId: "test", metadata, chains: [ethereumMainnet] },
  { session: fakeSession, storage: memoryStorage() },
);
```

Injecting `session` keeps the provider offline: Konekt does not open a relay socket at all. You can also inject `relay` to exercise the session protocol against a fake transport, or `seed` to make the relay identity deterministic.
