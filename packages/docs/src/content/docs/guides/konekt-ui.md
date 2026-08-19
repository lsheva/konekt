---
title: konekt-ui
description: Add an accessible React wallet picker, pairing QR, and optional wagmi account controls.
---

`konekt-ui` is an optional React interface for Konekt. It can list compatible wallets, show the pairing QR, open wallet links, and report connection errors.

Choose an entry point:

| Import | Use it when |
| --- | --- |
| `konekt-ui` | You have a Konekt `Provider`. Works with every configured namespace and does not require wagmi. |
| `konekt-ui/wagmi` | Your EVM app already manages connectors and account state with wagmi. |

The components require React 19 or newer. The wagmi entry point also requires wagmi 3 and viem 2.

## Install

```sh
pnpm add konekt konekt-ui react
```

Import the default stylesheet once near your app’s entry point:

```ts
import "konekt-ui/styles.css";
```

Skip the stylesheet only when you plan to use the `unstyled` option and supply all component styles yourself.

## Use WalletModal with a provider

`useProviderPairing()` adapts a Konekt provider to the state and actions required by `WalletModal`:

```tsx
import { useState } from "react";
import type { Provider } from "konekt";
import { useProviderPairing, WalletModal } from "konekt-ui";
import "konekt-ui/styles.css";

type WalletConnectionProps = {
  provider: Provider;
  projectId: string;
};

export function WalletConnection({ provider, projectId }: WalletConnectionProps) {
  const [open, setOpen] = useState(false);
  const pairing = useProviderPairing(provider);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Connect wallet
      </button>
      <WalletModal
        open={open}
        projectId={projectId}
        pairing={pairing}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

Use the same WalletConnect project ID for the provider and modal. The modal sends it to the WalletConnect Explorer when loading wallet listings.

When the user opens the QR view, the modal:

1. calls `provider.connect({ signal })`;
2. renders the URI from `display_uri`;
3. aborts the pending connection if the user closes the modal;
4. closes after the provider connects.

The provider adapter does not supply installed browser extensions. It lists WalletConnect Explorer wallets and the generic QR option. Use the wagmi adapter when you also want registered browser connectors to appear as installed wallets.

## wagmi

Install the optional peers:

```sh
pnpm add konekt konekt-ui react viem wagmi
```

`ConnectButton` uses the connectors already registered in your wagmi config:

- a connector whose `id` or `type` is `"konekt"` provides WalletConnect pairing;
- other connectors appear as installed wallet choices;
- after connection, the button opens account, network, and disconnect controls.

```tsx
import { ConnectButton } from "konekt-ui/wagmi";
import "konekt-ui/styles.css";

export function WalletControls({ projectId }: { projectId: string }) {
  return <ConnectButton projectId={projectId} />;
}
```

The wagmi entry point does not create a Konekt connector for you. Register the application-owned connector in `createConfig()`; it can still delay `Provider.init()` until first use, so static registration does not need to open a relay socket. The complete setup is in the [wagmi integration guide](../wagmi/).

`getWalletConnect` remains available for applications that already have a supported runtime connector-registration mechanism. Avoid private wagmi APIs. Pass `onDismiss` when connector-owned work needs separate cancellation, and use `useWagmiPairing()` when you want a custom trigger with `WalletModal`.

## Which wallets, which networks

By default, `WalletModal` asks the Explorer for wallets that support one of the provider’s configured chains. Override that list with CAIP-2 IDs:

```tsx
<WalletModal
  chains={["eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]}
  wallets={{
    featured: [metaMaskExplorerId, phantomExplorerId],
    exclude: [walletToHideExplorerId],
  }}
  projectId={projectId}
  pairing={pairing}
  onClose={() => setOpen(false)}
  open={open}
/>
```

Wallet filter values are WalletConnect Explorer IDs, not connector IDs or reverse-domain names.

| Filter | Effect |
| --- | --- |
| `include` | Show only these Explorer wallets. |
| `featured` | Put these wallets on the modal’s first screen. |
| `exclude` | Remove these wallets from Explorer results as each page loads. |

Filters do not hide installed wagmi connectors. Control those in your wagmi configuration.

## Theme and custom styles

The default `theme="system"` follows the user’s operating-system color scheme. Pass `theme="light"` or `theme="dark"` to lock it.

Override design tokens through `style`:

```tsx
<WalletModal
  open={open}
  projectId={projectId}
  pairing={pairing}
  onClose={() => setOpen(false)}
  theme="dark"
  style={{
    "--kui-accent": "#7c5cff",
    "--kui-radius": "20px",
  }}
/>
```

Pass `unstyled` to remove default `kui-*` classes. Stable `data-kui` and `data-kui-slot` attributes remain for your selectors.

When supplying custom styles, preserve visible keyboard focus, sufficient color contrast, the QR code’s square dimensions, and a clear error state.

## Built-in dialog behavior

The shared modal component:

- moves focus into the dialog when it opens;
- keeps Tab focus inside the dialog;
- closes on Escape or backdrop activation;
- restores focus to the previously focused element;
- exposes the dialog title and control labels to assistive technology.

If you compose the lower-level `Modal` or `QrCode` exports yourself, provide concise visible instructions alongside them. A QR code alone is not enough for someone who cannot scan it; offer a wallet link or copy action when possible.
