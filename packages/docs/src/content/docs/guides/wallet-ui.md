---
title: Wallet UI
description: Build your own pairing QR, cancel connection attempts, and open a wallet for session requests.
---

Konekt reports wallet UI work through events. It does not render a QR code, navigate to a wallet, or open a browser tab on its own.

Use:

- `display_uri` while creating a new session;
- `request_sent` when an approved session receives a signing or transaction request.

If you prefer a ready-made React interface, use [konekt-ui](../konekt-ui/).

## Show a pairing QR

Listen for `display_uri` before you call `connect()`. The event payload is a `wc:` URI that a WalletConnect-compatible wallet can scan:

```ts
const onUri = (uri: string) => {
  renderQrCode(uri);
};

provider.on("display_uri", onUri);

try {
  await provider.connect();
} finally {
  provider.off("display_uri", onUri);
  hideQrCode();
}
```

`display_uri` is emitted only when Konekt needs a new pairing. A restored session is already connected and does not need another QR.

Treat the URI as temporary secret material: show it only for the current attempt, do not include it in analytics, and remove it when the attempt finishes.

### Let the user cancel

Pass an `AbortSignal` to stop a pending proposal when the user closes your UI:

```ts
const controller = new AbortController();

function closePairingDialog() {
  controller.abort();
}

await provider.connect({ signal: controller.signal });
```

Create a new controller for each connection attempt. An aborted controller cannot be reused.

## Open the wallet for a request

After pairing, the user may still need to return to their wallet to approve a signature or transaction. `request_sent` fires after Konekt publishes that request.

```ts
provider.on("request_sent", ({ id, topic, url }) => {
  if (url) {
    window.location.assign(url);
  }
});
```

The event contains:

| Field | Meaning |
| --- | --- |
| `id` | The JSON-RPC request ID. |
| `topic` | The WalletConnect session topic. |
| `url` | A wallet URL when the wallet advertised a redirect and did not disable deep links; otherwise `undefined`. |

Your app decides whether and when to navigate. This avoids unexpected navigation and lets you adapt the behavior for desktop browsers, mobile browsers, and embedded apps.

Register this listener once during app setup, before sending requests.

### Build a request URL yourself

If your app already knows the wallet’s native or universal URL, `formatWalletRedirect()` adds the current request ID and session topic:

```ts
import { formatWalletRedirect } from "konekt";

const url = formatWalletRedirect(href, id, topic);
```

Telegram Mini App URLs (`https://t.me/...`) receive a `startapp` payload. Other URLs receive a `/wc?requestId=…&sessionTopic=…` path.

This helper formats a request redirect for an existing session. It does not put the initial pairing URI into a wallet deep link.

## Other provider events

The provider also exposes standard connection and account events:

| Event | Payload | When to use it |
| --- | --- | --- |
| `connect` | `{ chainId? }` | Mark a newly approved session as connected. |
| `disconnect` | `{ code, message }` | Clear connected UI and app state. |
| `accountsChanged` | `string[]` | Refresh the selected EVM account. |
| `chainChanged` | Hex chain ID such as `"0x1"` | Refresh chain-specific EVM state. |
| `message` | `{ type, data }` | Handle declared events from non-EVM forwarding adapters. |

Keep the exact listener function so you can remove it with `off()`:

```ts
const onDisconnect = () => {
  showDisconnectedState();
};

provider.on("disconnect", onDisconnect);
provider.off("disconnect", onDisconnect);
```
