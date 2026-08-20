---
title: Why Konekt is better
description: A smaller, modular, and more explicit WalletConnect client than the official provider or a full AppKit integration.
---

Konekt is the better WalletConnect client for apps that value performance, control, and a small dependency surface. It implements the WalletConnect v2 protocol directly, exposes a focused EIP-1193 provider, and keeps chains, authentication, reads, and UI behind separate imports.

:::note[WalletConnect is still the network]
Konekt does not replace the WalletConnect protocol or relay network. It is an alternative browser client implementation and still uses a WalletConnect project ID. Reown builds the official SDKs and AppKit.
:::

## Better at the connection layer

Konekt improves the parts of the official client stack that make a wallet connection unnecessarily heavy or opaque:

- **About 90% less JavaScript for headless EVM connectivity.** The modern-browser path is 14.53 kB through the first encrypted message, compared with 142.97 kB for the official Ethereum Provider’s main bundle.
- **No `@walletconnect` runtime dependency.** Konekt owns a compact implementation instead of layering an EVM provider over Universal Provider, Sign Client, Core, utilities, storage, and UI packages.
- **Pay only for what you import.** Chain adapters, HTTP reads, SIWE, server verification, and React UI are separate public entry points.
- **Use the platform before a polyfill.** Web Crypto handles secure curves, hashing, and key derivation on modern browsers; compatibility implementations load only when an operation is unavailable.
- **Explicit behavior instead of hidden policy.** Configured chain objects declare methods, events, and read transports. Wallet requests and HTTP reads have a visible routing boundary.
- **Your application stack stays in charge.** Konekt works under viem, wagmi, or ethers instead of trying to become the application’s account, token, and transaction framework.
- **Authentication has the right trust boundary.** The browser requests SIWE; a separate server import verifies the CACAO signature and claims.

Reown AppKit remains a different choice: it is a complete onboarding product with email and social login, embedded wallets, smart accounts, swaps, on-ramp, payments, and a large prebuilt UI. Choose [AppKit](https://docs.reown.com/appkit/overview) when you need that product suite. Choose Konekt when you need wallet connectivity without making that suite your application architecture.

## Bundle comparison

For a modern browser, Konekt’s headless EVM path transfers **14.53 kB minified and gzipped** by the first encrypted WalletConnect message: 9.69 kB initially and a 4.84 kB lazy cipher chunk.

| Comparable path | Minified + gzip | What is included |
| --- | ---: | --- |
| Konekt `Provider` + `evm`, through first encrypted message | **14.53 kB** | Headless provider, EVM adapter, relay client, and lazy ChaCha20-Poly1305 |
| `@walletconnect/ethereum-provider@2.23.10` main bundle | **142.97 kB** | Official headless EVM provider and its bundled runtime dependencies |
| `konekt-ui` wallet modal + styles | **12.40 kB** | React wallet picker, pairing QR, wallet links, and CSS |
| Konekt provider + wallet modal + styles | **26.93 kB** | Previous Konekt path, React wallet picker, QR modal, and CSS |
| `@reown/appkit@1.8.19` main bundle | **253.77 kB** | Full AppKit core/UI product and its bundled runtime dependencies |

On these published versions, Konekt’s headless EVM path is about **90% smaller** than the official Ethereum Provider’s main bundle. Konekt UI alone is about **95% smaller** than AppKit, while the complete small Konekt connect stack is about **89% smaller**. AppKit includes more product features, but Konekt does not force users who only need wallet connectivity to download the foundation for those features.

The Konekt figures come from the repository’s reproducible esbuild size check. The comparison figures are Bundlephobia production bundle results for the exact versions linked above:

- [`@walletconnect/ethereum-provider@2.23.10`](https://bundlephobia.com/package/@walletconnect/ethereum-provider@2.23.10)
- [`@reown/appkit@1.8.19`](https://bundlephobia.com/package/@reown/appkit@1.8.19)

Bundle tools handle entry points and dynamic chunks differently. Treat the table as a package-level comparison, then measure your own production application. The [bundle size guide](../bundle-size/) explains Konekt’s chunks, compatibility path, peer-dependency exclusions, and measurement method.

The [Konekt UI guide](../konekt-ui/) compares the UI packages directly, including wallet selection, pairing, account controls, theming, and the larger AppKit features Konekt intentionally leaves to the application.

## Why the implementation stays small

### Native cryptography first

Konekt asks Web Crypto to perform Ed25519, X25519, SHA-256, and HKDF operations. Noble implementations are dynamic compatibility chunks rather than part of the normal modern-browser path. ChaCha20-Poly1305 remains a lazy JavaScript chunk because browsers do not expose that WalletConnect cipher through Web Crypto.

### Narrow public entry points

The provider does not import chain adapters, HTTP reads, SIWE, CACAO verification, or React UI. Your imports describe the code you ship:

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";
```

Add `konekt/http`, `konekt/siwe`, another chain adapter, or `konekt-ui` only when the application uses it.

### Wallet connectivity, not an application framework

Konekt owns pairing, sessions, encrypted relay messages, and wallet requests. It does not own balances, token discovery, swaps, on-ramp, embedded accounts, or application state. That boundary avoids shipping a second copy of capabilities your viem, wagmi, ethers, or product code already provides.

### Explicit chain and request routing

Each configured chain declares its namespace, methods, events, and optional read transport. Wallet methods go to the approved wallet; configured JSON-RPC reads can go to your HTTP transport. Unsupported requests fail instead of silently selecting a broad default.

## A focused product is the advantage

Konekt deliberately leaves wallet ranking, modal design, public RPC selection, token features, and product analytics under application control. That is not a missing abstraction for teams already using viem, wagmi, ethers, or their own design system—it prevents the connection library from taking over responsibilities the app already owns.

If your requirement is “connect to WalletConnect wallets and make requests,” Konekt is the smaller, clearer, and more composable choice.
