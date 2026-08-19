---
title: Bundle size and loading
description: Measured bundle sizes, tree-shaking rules, and lazy-loading patterns for keeping wallet code off the initial path.
---

Konekt separates the provider, chain adapters, read transport, authentication, and React UI into public entry points. Your app can ship only the parts it uses—and can delay the whole wallet stack until someone opens the connect flow.

## Measured sizes

These are production bundle measurements from the repository’s `pnpm size` check:

| Import | Minified + gzip |
| --- | ---: |
| `Provider` + `evm` | 27.49 kB |
| `http` | 253 B |
| `siwe` + `cacaosOf` | 844 B |
| `verifyCacao` + `checkClaims` | 17.36 kB |
| `solana` + `solanaChain` | 732 B |
| `WalletModal` + `useProviderPairing` | 9.55 kB |
| wagmi `ConnectButton` | 11.02 kB |
| `konekt-ui/styles.css` | 2.85 kB |

The check bundles the listed exports and their runtime dependencies with esbuild, minifies the result, and reports gzip transfer size. The UI rows include the QR encoder but exclude peer dependencies such as React, viem, and wagmi; those libraries may already be shared by the application. Each row is measured independently, so do not add the rows to predict an application bundle—your bundler can share and deduplicate modules.

Exact output varies with dependency and bundler versions. The committed lockfile and [size configuration](https://github.com/lsheva/konekt/blob/master/.size-limit.mjs) make the repository result reproducible and enforce limits:

```sh
pnpm size
```

## Let tree-shaking work

The `konekt` package declares that its modules have no top-level side effects. `konekt-ui` marks only its CSS as side-effectful. A production ESM bundler can therefore remove exports and modules that are not reachable from your application.

Import from the narrow public entry point:

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";
```

Then add optional code only where it is needed:

```ts
import { http } from "konekt/http"; // Browser JSON-RPC reads through Provider
import { siwe } from "konekt/siwe"; // Authentication during pairing
```

Keep these boundaries in mind:

- Do not import every adapter through a local “export everything” barrel.
- If viem or wagmi already handles public reads, omit `konekt/http`.
- Keep `konekt/cacao` on the server that verifies authentication. Importing it in browser code adds signature-verification code without creating a trustworthy browser-side check.
- Import `konekt-ui/styles.css` only when using the styled React components.
- Check a production build. Development module counts and source-file sizes are not bundle sizes.

## Lazy-load the provider

If wallet state is not needed during the first render, load Konekt when the user opens the connect flow:

```ts
import type { Provider } from "konekt";

let providerPromise: Promise<Provider> | undefined;

async function initializeProvider() {
  const [{ Provider }, { evm }] = await Promise.all([
    import("konekt"),
    import("konekt/eip155"),
  ]);

  return Provider.init({
    projectId: "YOUR_PROJECT_ID",
    metadata: {
      name: "My app",
      description: "Connect to My app",
      url: window.location.origin,
      icons: [new URL("/icon.png", window.location.origin).href],
    },
    chains: evm(1),
  });
}

export function getProvider() {
  if (!providerPromise) {
    providerPromise = initializeProvider().catch((error) => {
      providerPromise = undefined;
      throw error;
    });
  }
  return providerPromise;
}
```

The type-only import is erased from the browser output. Caching the promise prevents two quick clicks from creating competing initialization work, while clearing a rejected promise lets the user retry.

This changes behavior as well as loading time: a saved session is not restored until `getProvider()` runs. Initialize eagerly when the page must show the connected account immediately.

Chains and features must be present on the first `Provider.init()` call. The provider is a process singleton and later calls do not add options. To lazy-load SIWE, for example, import it inside `initializeProvider()` and pass it in that same call; do not try to attach it after initialization.

## Lazy-load the React wallet UI

Put wallet-only imports in their own component:

```tsx
// WalletDialog.tsx
import type { Provider } from "konekt";
import { useProviderPairing, WalletModal } from "konekt-ui";
import "konekt-ui/styles.css";

export default function WalletDialog(props: {
  open: boolean;
  projectId: string;
  provider: Provider;
  onClose: () => void;
}) {
  const { provider, ...modalProps } = props;
  const pairing = useProviderPairing(provider);

  return <WalletModal {...modalProps} pairing={pairing} />;
}
```

Load that component only while it is visible:

```tsx
import type { Provider } from "konekt";
import { lazy, Suspense, useState } from "react";

const WalletDialog = lazy(() => import("./WalletDialog"));

export function WalletArea(props: { projectId: string; provider: Provider }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Connect wallet
      </button>
      {open && (
        <Suspense fallback={<p role="status">Loading wallet options…</p>}>
          <WalletDialog
            open
            projectId={props.projectId}
            provider={props.provider}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
```

Bundlers such as Vite can place the component JavaScript and CSS in lazy chunks. Keep a visible loading state: downloading code after a click without feedback makes the interface appear broken.

For wagmi, statically registering the small application connector is still the recommended path. The connector can dynamically import Konekt inside `getProvider()`, so registration itself does not load the provider or open a relay socket. See the [wagmi guide](../wagmi/).

## What to optimize first

1. Keep server verification out of the browser.
2. Avoid duplicate read clients: use either Konekt’s `read` transport or the viem/wagmi HTTP path when one is sufficient.
3. Lazy-load the connect flow when the initial page does not need restored wallet state.
4. Measure the application’s production output, including shared React, viem, and wagmi chunks.

Lazy loading moves bytes to a later request; it does not reduce the total bytes needed after the user opens the wallet flow. Tree-shaking removes code that the application never uses.
