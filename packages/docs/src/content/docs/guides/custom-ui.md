---
title: Design your own connect UI
description: Keep your own buttons and dialogs by composing the konekt-ui hooks and building blocks, and ship only the pieces you import.
---

[Getting started](../getting-started/) used `ConnectButton`, the fully assembled flow. That component is one arrangement of smaller parts, and every part is exported. This page peels the layers off one at a time: first your own trigger, then your own dialog, then your own wallet list—each step using hooks and small components instead of the prebuilt ones.

Nothing here requires new concepts. The hooks return one object, described next, and your components render it.

## The pairing contract

`useWagmiPairing()` (for wagmi apps) and `useProviderPairing(provider)` (for apps holding a Konekt `Provider` directly) both return a `Pairing`:

| Field | Meaning |
| --- | --- |
| `connected` | Whether a wallet is currently connected. |
| `local` | Wallets already available in the browser—wagmi connectors, or injected-wallet sources. |
| `connectLocal(wallet)` | Connects one of `local`. |
| `start(onUri)` | Starts WalletConnect pairing and reports the QR URI. Returns a teardown that cancels it. |
| `reset()` | Clears a previous error before a new attempt. |
| `error` | A human-readable pairing failure to display. |
| `chains` | CAIP-2 chain IDs, used to filter the wallet listings. |
| `projectId` | WalletConnect project ID, read from the provider or connector, for Explorer listings. |

Everything below consumes this one object, so a component written against it works with wagmi and without it.

## Step 1: your trigger, the ready dialog

The smallest customization: keep `WalletModal`, replace the button. In a wagmi app:

```tsx
import { useState } from "react";
import { WalletModal } from "konekt-ui";
import { abortPairing, useWagmiPairing } from "konekt-ui/wagmi";
import "konekt-ui/styles.css";

export function CustomWalletButton() {
  const [open, setOpen] = useState(false);
  const pairing = useWagmiPairing();

  return (
    <>
      <button type="button" className="my-own-button" onClick={() => setOpen(true)}>
        Choose a wallet
      </button>
      <WalletModal
        open={open}
        pairing={pairing}
        onDismiss={abortPairing}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

Without wagmi, swap the hook: `useProviderPairing(provider)` produces the same `pairing`, and `onDismiss` is unnecessary because the hook owns the cancellation.

If the ready dialog is right but the styling is not, you may not need to go further: `theme`, `--kui-*` token overrides in `style`, and the `unstyled` prop restyle `WalletModal` without replacing it. See [theme and custom styles](../konekt-ui/#theme-and-custom-styles).

## Step 2: your dialog, hooks only

To own the dialog itself, call `pairing.start()` and render the URI. `QrCode` draws it; `Modal` provides the accessible shell (focus trap, Escape, backdrop, restored focus), or use your design system's dialog instead:

```tsx
import { useEffect, useState } from "react";
import type { Provider } from "konekt";
import { Modal, type Pairing, QrCode, useProviderPairing } from "konekt-ui";

function PairingView({ pairing }: { pairing: Pairing }) {
  const [uri, setUri] = useState<string>();

  // start() subscribes to the URI and begins connecting; its teardown cancels
  // the attempt, so closing the dialog aborts cleanly.
  useEffect(() => pairing.start(setUri), [pairing.start]);

  if (pairing.error) return <p role="alert">{pairing.error}</p>;
  if (!uri) return <p role="status">Preparing the connection…</p>;
  return <QrCode value={uri} />;
}

export function ConnectDialog(props: { provider: Provider; open: boolean; onClose: () => void }) {
  const pairing = useProviderPairing(props.provider);

  useEffect(() => {
    if (props.open && pairing.connected) props.onClose();
  }, [props.open, pairing.connected, props.onClose]);

  return (
    <Modal open={props.open} onClose={props.onClose} title="Scan with your wallet">
      <PairingView pairing={pairing} />
    </Modal>
  );
}
```

Two details carry the whole design:

- Depend on `pairing.start`, which is stable across renders, rather than on the `pairing` object, which is not. Restarting the effect restarts the pairing.
- The QR alone is not enough for someone who cannot scan it. Offer a copy action or a wallet link alongside it, and keep a visible loading state.

## Step 3: your wallet list

`WalletModal` fills its list from two places, and both are available to your components:

- `pairing.local` — wallets already in the browser. Render them as buttons that call `pairing.connectLocal(wallet)`.
- `fetchWallets()` — one page of WalletConnect Explorer listings, filtered by `filterWallets()` with `include`, `exclude`, and `featured` IDs.

On a phone there is nothing to scan, so a tapped wallet should open directly: `walletHref(listing, uri)` builds the deep link from a listing and the pairing URI, `openWalletLink()` navigates to it, and `isMobile()` tells you which presentation to prefer.

| Export | From | Purpose |
| --- | --- | --- |
| `Modal` | `konekt-ui` | Accessible dialog shell. |
| `QrCode` | `konekt-ui` | Renders a pairing URI. Takes `value` and an optional `size`. |
| `fetchWallets` | `konekt-ui` | Queries the WalletConnect Explorer, one page at a time. |
| `filterWallets` | `konekt-ui` | Applies `include`, `exclude`, and `featured` to listings. |
| `FEATURED_WALLET_IDS` | `konekt-ui` | The default featured Explorer IDs. |
| `walletHref` | `konekt-ui` | Wallet deep link from a listing and a pairing URI. |
| `openWalletLink` | `konekt-ui` | Navigates to a wallet link. |
| `isMobile` | `konekt-ui` | Whether to prefer deep links over a QR code. |
| `AccountModal` | `konekt-ui/wagmi` | The connected account and network dialog, reusable behind a custom button. |

## Keep the bundle honest

Building your own UI is also how you keep the download small, if you follow three rules:

- **Import only what you render.** `konekt-ui` declares its modules side-effect free, so a production ESM bundler drops every component and helper you never import. A hooks-only dialog does not pay for `WalletModal`, the Explorer client, or the account controls.
- **Skip the stylesheet when you own the styles.** `import "konekt-ui/styles.css"` is only for the styled components. Custom components—or `unstyled` ones targeted through their `data-kui` attributes—do not need it.
- **Load the dialog when it opens.** Wallet UI is rarely needed on first paint. Put the dialog in its own component and load it with `React.lazy` behind the click; the [bundle size guide](../bundle-size/#lazy-load-the-react-wallet-ui) shows the complete pattern and the measured effect.

## Where to go next

You now control the React layer completely. The next page, [Plain JavaScript](../vanilla/), removes React as well: the provider, its events, and nothing else. That is the layer these hooks are built on, and the one you will use from any framework—or none.
