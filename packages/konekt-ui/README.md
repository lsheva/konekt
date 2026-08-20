# konekt-ui

[![npm](https://img.shields.io/npm/v/konekt-ui)](https://www.npmjs.com/package/konekt-ui)
[![license](https://img.shields.io/badge/license-ISC-blue)](./LICENSE)

Connect UI for [`konekt`](https://www.npmjs.com/package/konekt). Two entry points:

- `konekt-ui` — `WalletModal`, `useProviderPairing`, `Modal`, `QrCode`, the explorer client. Any namespace, no wagmi.
- `konekt-ui/wagmi` — `ConnectButton`, `AccountModal`, `useWagmiPairing`. EVM, through a wagmi config.

The theme is a plain stylesheet: `import "konekt-ui/styles.css"`.

```sh
pnpm add konekt konekt-ui react
```

The wagmi entry point additionally requires `viem` and `wagmi`:

```sh
pnpm add viem wagmi
```

Peer ranges are React 19 or newer, wagmi 3, and viem 2.

Full guide: [lsheva.github.io/konekt/guides/konekt-ui](https://lsheva.github.io/konekt/guides/konekt-ui/)

## Any provider

`WalletModal` does not know what it is pairing with. It takes a `Pairing`, and `useProviderPairing` builds one from a `konekt` provider:

```tsx
import { useProviderPairing, WalletModal } from "konekt-ui";
import "konekt-ui/styles.css";

const pairing = useProviderPairing(provider);

<WalletModal open={open} projectId={projectId} pairing={pairing} onClose={() => setOpen(false)} />;
```

Opening the QR view calls `provider.connect({ signal })` and renders the `display_uri` it emits. Closing the modal aborts that signal, so the pairing is cancelled with it.

## wagmi

`ConnectButton` renders the connect trigger, the account button, and both modals. It pairs through the `konekt` connector and lists the app's other connectors as installed wallets:

```tsx
import { ConnectButton } from "konekt-ui/wagmi";
import "konekt-ui/styles.css";

<ConnectButton projectId={projectId} getWalletConnect={registerKonekt} />;
```

`getWalletConnect` is only needed when the config was built without the connector; the modal awaits it before pairing. Use `useWagmiPairing` directly to keep your own trigger and pass its result to `WalletModal`.

## Which wallets, which networks

```tsx
<WalletModal
  open={open}
  projectId={projectId}
  pairing={pairing}
  onClose={() => setOpen(false)}
  chains={["eip155:1", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"]}
  wallets={{ exclude: [ledgerId], featured: [phantomId, metaMaskId] }}
/>
```

`chains` are CAIP-2 ids: the explorer only lists wallets that support one of them. It defaults to the chains the provider proposes, so passing a provider usually passes its networks too.

`wallets` holds explorer ids. `include` lists exactly those wallets and turns the all-wallets screen into that one page; `featured` picks the first screen (default `FEATURED_WALLET_IDS`); `exclude` is applied to each page as it arrives, because the explorer has no exclude parameter — its paging totals still count the wallets you dropped. Installed wallets come from the app's own connectors, so `exclude` does not touch them.

## Theming

The default theme follows the operating-system color scheme. Set `theme="light"` or `theme="dark"` to lock it, and use `style` to override any design token:

```tsx
<ConnectButton
  projectId={projectId}
  theme="dark"
  style={{
    "--kui-accent": "#7c5cff",
    "--kui-radius": "20px",
  }}
/>;
```

Both color schemes come from one set of `light-dark()` tokens, so an override applies to both unless you pass `light-dark(a, b)` yourself. Surfaces are `--kui-bg`, `--kui-surface`, `--kui-surface-hover`, `--kui-surface-active`; text is `--kui-text`, `--kui-subtle`, `--kui-muted`; radii are `--kui-radius` (dialog), `--kui-radius-l` (rows), `--kui-radius-m`, `--kui-radius-s`, `--kui-radius-round` (pills). `--kui-font` lists KHTeka first and falls back to the system stack, so the components pick it up when the page already loads that font.

## Custom styling

Skip `konekt-ui/styles.css` and pass `unstyled` to drop the default `kui-*` classes. Semantic attributes remain stable, so custom styles can target slots without depending on the default theme:

```css
.wallet-connect [data-kui-slot="connect-button"] {
  border: 0;
  border-radius: 999px;
  padding: 12px 18px;
}

[data-kui="modal"] [data-kui-slot="dialog"] {
  background: white;
  border-radius: 24px;
}
```

## License

[ISC](./LICENSE)
