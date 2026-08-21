---
title: konekt-ui
description: Add an accessible React wallet picker, pairing QR, and optional wagmi account controls.
---

`konekt-ui` is an optional React interface for Konekt. It can list compatible wallets, show the pairing QR, open wallet links, and report connection errors.

:::tip[Try it live]
The [konekt showcase](https://lsheva.github.io/konekt/showcase/) pairs a raw `Provider` through `WalletModal` and `useProviderPairing`, then exercises every method the session settles.
:::

:::tip[About 95% smaller than AppKit]
The Konekt wallet modal and stylesheet are **12.40 kB** minified and gzipped. The `@reown/appkit@1.8.19` main bundle is **253.77 kB**—Konekt’s focused UI layer is about **95% smaller**.
:::

Choose an entry point:

| Import | Use it when |
| --- | --- |
| `konekt-ui` | You have a Konekt `Provider`. Works with every configured namespace and does not require wagmi. |
| `konekt-ui/wagmi` | Your EVM app already manages connectors and account state with wagmi. |

The components require React 19 or newer. The wagmi entry point also requires wagmi 3 and viem 2.

## Konekt UI vs Reown AppKit

Konekt UI is better when the app needs a wallet picker, pairing QR, and account controls without adopting a full onboarding platform.

| UI path | First load | Overall |
| --- | ---: | ---: |
| Vite app with Konekt `WalletModal` | **18.05 kB** | **44.52 kB** |
| Vite app with `@reown/appkit@1.8.23` | **721.26 kB** | **1079.28 kB** |

Those rows are production builds of `packages/size-konekt-ui` and `packages/size-appkit`, with React marked external. The Konekt modal and stylesheet alone are **12.40 kB** (9.55 kB JavaScript and 2.85 kB CSS); the wagmi `ConnectButton` path is **13.87 kB** with the same stylesheet. AppKit remains a broader product, but even with email, socials, swaps, on-ramp, and analytics disabled it still first-loads wallet-list and email UI.

| Capability | Konekt UI | Reown AppKit |
| --- | --- | --- |
| Wallet picker and pairing QR | Yes | Yes |
| Mobile wallet links | Yes | Yes |
| Light, dark, and system themes | Yes | Yes |
| App-owned styling and unstyled mode | Yes | Theming APIs |
| Optional wagmi account, network, and disconnect controls | Yes | Yes |
| Embedded email and social wallets | No | Yes |
| Smart accounts | No | Yes |
| Built-in swaps and on-ramp | No | Yes |

That narrower scope is the advantage for apps that already own authentication, transactions, RPC access, and visual design. Konekt UI does not make those applications download or configure unrelated product features. AppKit is the better fit only when the app wants its broader onboarding and transaction suite.

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

### What the modal does on its own

Pairing does not begin when the modal opens. It begins when the user picks a wallet or the WalletConnect option and reaches the QR view. From there the modal:

1. calls `provider.connect({ signal })`;
2. renders the URI from `display_uri`;
3. on a mobile browser, opens the selected wallet’s deep link as soon as the URI arrives;
4. aborts the pending connection and calls `onDismiss` if the user leaves before it finishes;
5. closes itself once the provider connects, by calling `onClose`.

Because it closes itself, keep `open` as controlled state and let `onClose` set it to `false`. The modal also skips pairing entirely when `pairing.connected` is already true.

The provider adapter does not supply installed browser extensions. It lists WalletConnect Explorer wallets and the generic QR option. Use the wagmi adapter when you also want registered browser connectors to appear as installed wallets.

### `WalletModal` props

| Prop | Type | Purpose |
| --- | --- | --- |
| `open` | `boolean` | Whether the dialog renders. Required. |
| `projectId` | `string` | Explorer queries. Required, and the same ID as the provider. |
| `pairing` | `Pairing` | From `useProviderPairing()` or `useWagmiPairing()`. Required. |
| `onClose` | `() => void` | Asks the parent to set `open` to `false`. Required. |
| `chains` | `readonly string[]` | CAIP-2 IDs used to filter Explorer results. Defaults to the provider’s chains. |
| `wallets` | `WalletFilter` | `include`, `exclude`, and `featured` Explorer IDs. |
| `onDismiss` | `() => void` | Runs when the user abandons an unfinished pairing. |
| `theme` | `"light" \| "dark" \| "system"` | Color scheme. Defaults to `"system"`. |
| `className` | `string` | Extra class on the root. |
| `style` | `WcStyle` | Inline styles plus `--kui-*` token overrides. |
| `unstyled` | `boolean` | Drops the default `kui-*` classes, keeping `data-kui` attributes. |

`className`, `style`, `theme`, and `unstyled` are shared by every konekt-ui component.

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

### `ConnectButton` props

| Prop | Type | Purpose |
| --- | --- | --- |
| `projectId` | `string` | Explorer queries. Required. |
| `chains` | `readonly string[]` | CAIP-2 IDs for wallet filtering. Defaults to the configured wagmi chains. |
| `wallets` | `WalletFilter` | `include`, `exclude`, and `featured` Explorer IDs. |
| `getWalletConnect` | `() => Promise<Connector>` | Supplies the Konekt connector when the wagmi config does not already contain one. |
| `onDismiss` | `() => void` | Cancels connector-owned pairing work when the user closes the modal. |

It also accepts the shared `theme`, `className`, `style`, and `unstyled` props.

Three of these cover the less common cases:

- `getWalletConnect` is a `ConnectButton` prop (and a `useWagmiPairing()` option) that returns the WalletConnect connector on demand, for apps that keep it out of `createConfig()` so a visitor who never connects never loads Konekt. See the [wagmi guide](../wagmi/#static-and-lazy-connector-registration) for the trade-off it carries.
- `onDismiss` runs when the user closes the modal, so connector-owned work can be cancelled alongside the pairing.
- `useWagmiPairing()` gives you the same pairing state without `ConnectButton`, for a custom trigger rendered with `WalletModal`.

## Which wallets, which networks

By default, `WalletModal` asks the Explorer for wallets that support one of the provider’s configured chains. Override that list with CAIP-2 IDs:

```tsx
import { useState } from "react";
import type { Provider } from "konekt";
import { useProviderPairing, WalletModal } from "konekt-ui";

// Copy the IDs from https://walletconnect.com/explorer
const featuredWalletIds = ["…", "…"];
const hiddenWalletIds = ["…"];

export function WalletPicker({ provider, projectId }: { provider: Provider; projectId: string }) {
  const [open, setOpen] = useState(false);
  const pairing = useProviderPairing(provider);

  return (
    <WalletModal
      open={open}
      projectId={projectId}
      pairing={pairing}
      onClose={() => setOpen(false)}
      chains={["eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]}
      wallets={{ featured: featuredWalletIds, exclude: hiddenWalletIds }}
    />
  );
}
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

```tsx ignore
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

## Building your own picker

`WalletModal` is one arrangement of smaller exports. Use them directly when you need a different one.

| Export | From | Purpose |
| --- | --- | --- |
| `Modal` | `konekt-ui` | The accessible dialog shell: focus trap, Escape, backdrop, restored focus. |
| `QrCode` | `konekt-ui` | Renders a pairing URI as a QR code. |
| `fetchWallets` | `konekt-ui` | Queries the WalletConnect Explorer. Returns one page of listings. |
| `filterWallets` | `konekt-ui` | Applies `include`, `exclude`, and `featured` to listings. |
| `FEATURED_WALLET_IDS` | `konekt-ui` | Default featured Explorer IDs. |
| `walletHref` | `konekt-ui` | Builds a wallet deep link from a listing and a pairing URI. |
| `openWalletLink` | `konekt-ui` | Navigates to a wallet link. |
| `isMobile` | `konekt-ui` | Whether to prefer deep links over a QR code. |
| `AccountModal` | `konekt-ui/wagmi` | The connected account and network dialog `ConnectButton` opens. |

`AccountModal` is controlled through `open`, `view` (`"account"` or `"networks"`), `onView`, and `onClose`, so a custom button can reuse the account and network switching UI without `ConnectButton`.
