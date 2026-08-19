---
name: konekt-ui
description: >
  Builds konekt connect UI. Use when adding WalletModal, ConnectButton, useProviderPairing,
  useWagmiPairing, konekt-ui, or a WalletConnect modal / QR in React.
---

# konekt-ui

React 19 UI for `konekt`. Import `konekt-ui/styles.css` once unless every component is `unstyled`.

## Provider (any chain)

```tsx
import { useState } from "react";
import type { Provider } from "konekt";
import { useProviderPairing, WalletModal } from "konekt-ui";
import "konekt-ui/styles.css";

export function WalletButton({ provider, projectId }: { provider: Provider; projectId: string }) {
  const [open, setOpen] = useState(false);
  const pairing = useProviderPairing(provider);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Connect wallet</button>
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

`useProviderPairing` supports every namespace and does not require wagmi. The QR view calls
`provider.connect({ signal })`, renders `display_uri`, and aborts the signal when it closes.

## wagmi

```tsx
import { ConnectButton } from "konekt-ui/wagmi";
import "konekt-ui/styles.css";

<ConnectButton projectId={projectId} />;
```

- The wagmi config must contain a Konekt connector whose `id` or `type` is `"konekt"`.
- This package does not create the connector.
- Prefer static registration in `createConfig()`. The connector can initialize `Provider` lazily,
  so registration itself does not need to open a relay socket.
- If the config omits it initially, pass `getWalletConnect: () => Promise<Connector>` to register and
  return it through an application-owned public mechanism. Do not use wagmi `_internal` APIs.
- Pass `onDismiss` when connector-owned pairing work also needs cancellation.
- Use `useWagmiPairing` for a custom trigger with `WalletModal`.

## Lazy loading

- Put `WalletModal`, its pairing hook, and `konekt-ui/styles.css` in a wallet-only component, then
  load that component with `React.lazy()` when the user opens it.
- Render an accessible loading state while the chunk downloads.
- A statically registered wagmi connector may still import and initialize Konekt lazily in
  `getProvider()`.
- Read `/guides/bundle-size/` for measured sizes and complete examples.

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
