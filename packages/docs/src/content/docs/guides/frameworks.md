---
title: Frameworks and SSR
description: Initialize Konekt safely in Vite, Next.js, and other server-rendered React apps.
---

Konekt is a browser library. It needs Web Crypto, `WebSocket`, and `localStorage`, and every guide’s setup snippet assumes a browser is present. In a server-rendered app, keep initialization on the client.

## What breaks on the server

| Dependency | Server behavior |
| --- | --- |
| `window.location.origin` in `metadata` | Throws. `window` does not exist. |
| `localStorage` | Missing, so Konekt silently falls back to memory storage and no session persists. |
| Web Crypto | Missing outside a secure context, and `Provider.init()` rejects with `Web Crypto unavailable`. |
| `WebSocket` | Missing, so the relay cannot connect. |

None of this is a problem as long as `Provider.init()` runs in the browser. The mistake to avoid is calling it at module scope in a file the server also evaluates.

## Vite and other client-only apps

Nothing special is required. Top-level initialization works because the module only ever runs in a browser:

```ts
// src/provider.ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";

export const provider = await Provider.init({
  projectId: import.meta.env.VITE_WC_PROJECT_ID,
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: window.location.origin,
    icons: [new URL("/icon.png", window.location.origin).href],
  },
  chains: evm(1),
});
```

Even here, consider initializing on demand instead so visitors who never connect a wallet do not download the provider. See [Bundle size and loading](../bundle-size/).

## Next.js App Router

Create the provider inside a client component, after mount. This hook keeps it out of the server render and still initializes only once:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Provider } from "konekt";

let providerPromise: Promise<Provider> | undefined;

function getProvider() {
  providerPromise ??= (async () => {
    const [{ Provider }, { evm }] = await Promise.all([
      import("konekt"),
      import("konekt/eip155"),
    ]);

    return Provider.init({
      projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID as string,
      metadata: {
        name: "My app",
        description: "Connect to My app",
        url: window.location.origin,
        icons: [new URL("/icon.png", window.location.origin).href],
      },
      chains: evm(1),
    });
  })().catch((error) => {
    providerPromise = undefined;
    throw error;
  });

  return providerPromise;
}

export function useKonekt() {
  const [provider, setProvider] = useState<Provider>();

  useEffect(() => {
    let active = true;
    void getProvider().then((p) => {
      if (active) setProvider(p);
    });
    return () => {
      active = false;
    };
  }, []);

  return provider;
}
```

The dynamic imports mean no Konekt code is evaluated during the server render, and clearing a rejected promise lets a failed attempt be retried.

`useProviderPairing()` accepts `undefined`, so a wallet button can render before the provider is ready:

```tsx
"use client";

import { useState } from "react";
import { useProviderPairing, WalletModal } from "konekt-ui";
import "konekt-ui/styles.css";
import { useKonekt } from "./useKonekt";

export function ConnectWallet({ projectId }: { projectId: string }) {
  const provider = useKonekt();
  const pairing = useProviderPairing(provider);
  const [open, setOpen] = useState(false);

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

Starting a pairing before the provider exists shows a readable error rather than crashing.

### Set `metadata.url` to your real origin

Wallets display this URL during approval, and SIWE binds to it. `window.location.origin` is correct in the browser, but hardcode the production origin if you also build the metadata anywhere the server can reach:

```ts
const url = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
```

The `domain` and `uri` passed to [`siwe()`](../features/) must match what your server checks with `checkClaims()`, so keep both derived from the same value.

## Next.js with wagmi

Follow the [wagmi guide](../wagmi/) for the connector, then make the config SSR-aware. Wagmi needs `ssr: true` so it hydrates from cookies instead of assuming browser storage:

```ts
"use client";

import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { base, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { konekt } from "./konekt";

const konektOptions = {
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID as string,
  metadata: {
    name: "My app",
    description: "Connect to My app",
    url: "https://app.example.com",
    icons: ["https://app.example.com/icon.png"],
  },
};

export const config = createConfig({
  chains: [mainnet, base],
  connectors: [injected(), konekt(konektOptions)],
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
  },
});
```

The Konekt connector imports Konekt lazily inside `getProvider()`, so registering it in a config that the server also evaluates does not pull the provider into the server bundle. It initializes when wagmi first asks the connector whether it is authorized, which happens in the browser.

Mark the file that calls `createConfig()` and the component rendering `WagmiProvider` as `"use client"`.

## React Native and other non-browser runtimes

Konekt targets browsers. A runtime without Web Crypto, `WebSocket`, and a storage implementation is not supported. In Node, where `localStorage` is absent, Konekt falls back to memory storage, so sessions last only as long as the process. Pass your own `storage` to persist them. See [Sessions](../sessions/#choose-a-different-store).
