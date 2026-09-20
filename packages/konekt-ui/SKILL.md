---
name: konekt-ui
description: >
  Builds konekt connect UI. Use when adding WalletModal, ConnectButton, useProviderPairing,
  useWagmiPairing, konekt-ui, or a WalletConnect modal / QR in React.
---

# konekt-ui

React 18+ UI for `konekt`. Import `konekt-ui/styles.css` once unless every component is `unstyled`.

## Provider (any chain)

```tsx
import { useState } from "react";
import type { Provider } from "konekt";
import { useProviderPairing, WalletModal } from "konekt-ui";
import "konekt-ui/styles.css";

export function WalletButton({ provider }: { provider: Provider }) {
  const [open, setOpen] = useState(false);
  const pairing = useProviderPairing(provider);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Connect wallet</button>
      <WalletModal
        open={open}
        pairing={pairing}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

`useProviderPairing` supports every namespace and does not require wagmi. The pairing carries the
provider's project ID for Wallet Explorer queries, so the modal takes no `projectId` prop. The QR view calls
`provider.connect({ signal })`, renders `display_uri`, and aborts the signal when it closes.

## Mobile

The modal already handles phones; do not rebuild this. It pairs when it opens rather than on tap,
because WebKit drops a redirect to a custom scheme once the gesture expires, then leaves for the
wallet inside the tap, shows "Continue in Wallet" with an Open button instead of an unscannable QR,
and lists only wallets with a mobile link. A pairing near its deadline is replaced, and `onDismiss`
runs for the discarded attempt as well as for a user who left.

In a custom picker, call `openWalletLink()` in the tap handler, never in an effect awaiting the URI.
`walletLink(listing, true)` asks whether a phone can reach a wallet at all; `pairingRefreshDelay(uri)`
gives the milliseconds that URI may still be offered.

## Injected wallets without wagmi

`useProviderPairing(provider, { sources })` lists injected wallets as installed choices next to
WalletConnect pairing. Sources are discovery only: connecting one never touches the provider, and
after `onConnect` the app owns the wallet handle, its accounts, and its signing.

```tsx
import { useCosmosSource } from "konekt-ui/cosmos";
import { useWalletStandardSource } from "konekt-ui/wallet-standard";

const solana = useWalletStandardSource({ onConnect: keepSolanaHandle });
const cosmos = useCosmosSource({ chainIds: ["cosmoshub-4"], onConnect: keepKeplrHandle });
const pairing = useProviderPairing(provider, { sources: [solana, cosmos] });
```

- `konekt-ui/wallet-standard` is for Solana: it lists Wallet Standard extensions (Phantom,
  Solflare, Backpack) serving `solana:` chains. The `chains` option takes Wallet Standard network
  names like `"solana:mainnet"`, not Konekt's genesis-hash CAIP-2 ids.
- `konekt-ui/cosmos` probes `window.keplr`-shaped extensions (Keplr, Leap) and calls
  `enable(chainIds)` on connect.
- EVM injected wallets stay with wagmi (`useWagmiPairing`); do not re-implement them as a source.
- A custom source is `{ wallets, connect, connected }` (`LocalWalletSource` from `konekt-ui`).

## wagmi

```tsx
import { ConnectButton } from "konekt-ui/wagmi";
import "konekt-ui/styles.css";

<ConnectButton />;
```

- `konekt-ui/wagmi` exports the connector: register `konekt({ projectId, metadata })` in
  `createConfig()`, and pass `abortPairing` as `onDismiss`. Its `id` and `type` are `"konekt"`.
  The entry works with wagmi 2 and 3.
- The button reads the project ID from the registered connector; do not pass a `projectId` prop
  unless the connector is created lazily.
- Prefer static registration in `createConfig()`. The connector initializes `Provider` lazily,
  so registration itself does not open a relay socket.
- If the config omits it initially, pass `getWalletConnect: () => Promise<Connector>` to create and
  return it on demand, plus `projectId` so the wallet list loads before the connector exists.
  wagmi has no public API for this; `config._internal.connectors.setup()` is
  the only way. Use it only when asked for on-demand registration, and say that it is private API.
- Pass `onDismiss` when connector-owned pairing work also needs cancellation.
- Use `useWagmiPairing` for a custom trigger with `WalletModal`.
- `Avatar` is the address-derived disc; `truncateAddress` shortens a hex address. Use both for a
  custom account chip.

## Lazy loading

- Put `WalletModal`, its pairing hook, and `konekt-ui/styles.css` in a wallet-only component, then
  load that component with `React.lazy()` when the user opens it.
- Render an accessible loading state while the chunk downloads.
- A statically registered wagmi connector may still import and initialize Konekt lazily in
  `getProvider()`.
- Read `https://lsheva.github.io/konekt/guides/bundle-size/` for measured sizes and complete examples.

## Filters

- `chains` contains CAIP-2 IDs. Explorer results must support at least one. Provider pairing
  defaults to the provider's configured chains.
- `wallets.include`, `wallets.featured`, and `wallets.exclude` contain WalletConnect Explorer IDs.
- Explorer filters do not remove installed wagmi connectors.

## Appearance and accessibility

- `theme="light" | "dark"` locks the color scheme; the default follows the OS.
- `style` overrides `--kui-*` design tokens.
- `unstyled` removes default classes but preserves `data-kui` and `data-kui-slot`.
- When styling from scratch, preserve focus indicators, contrast, dialog behavior, and square QR
  dimensions.
