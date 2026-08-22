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

- **A real React app first-loads 10.75 kB with Konekt, against 145.74 kB for the official Ethereum Provider and 721.26 kB for AppKit.** Those are production Vite builds of matched apps in this repository, with React marked external.
- **No `@walletconnect` runtime dependency.** Konekt owns a compact implementation instead of layering an EVM provider over Universal Provider, Sign Client, Core, utilities, storage, and UI packages.
- **Pay only for what you import.** Chain adapters, HTTP reads, SIWE, server verification, and React UI are separate public entry points.
- **Use the platform before a polyfill.** Web Crypto handles secure curves, hashing, and key derivation on modern browsers; compatibility implementations load only when an operation is unavailable.
- **Explicit behavior instead of hidden policy.** Configured chain objects declare methods, events, and read transports. Wallet requests and HTTP reads have a visible routing boundary.
- **Your application stack stays in charge.** Konekt works under viem, wagmi, or ethers instead of trying to become the application’s account, token, and transaction framework.
- **Authentication has the right trust boundary.** The browser requests SIWE; a separate server import verifies the CACAO signature and claims.

Reown AppKit remains a different choice: it is a complete onboarding product with email and social login, embedded wallets, smart accounts, swaps, on-ramp, payments, and a large prebuilt UI. Choose [AppKit](https://docs.reown.com/appkit/overview) when you need that product suite. Choose Konekt when you need wallet connectivity without making that suite your application architecture.

## Bundle comparison

Package-main-bundle numbers understate the official stack. A production Vite React app that only connects Ethereum and shows an address transfers **10.75 kB** on first load with Konekt, **145.74 kB** with `@walletconnect/ethereum-provider@2.23.10`, **18.09 kB** with Konekt UI, and **721.26 kB** with `@reown/appkit@1.8.23`. After every lazy chunk is counted, those become **33.49 kB**, **538.06 kB**, **44.56 kB**, and **1079.28 kB**. React is marked external in all four builds.

| Vite app | First load | Overall |
| --- | ---: | ---: |
| Konekt | **10.75 kB** | **33.49 kB** |
| `@walletconnect/ethereum-provider@2.23.10` | **145.74 kB** | **538.06 kB** |
| Konekt + `konekt-ui` | **18.09 kB** | **44.56 kB** |
| `@reown/appkit@1.8.23` + ethers adapter | **721.26 kB** | **1079.28 kB** |

Headless Konekt is **92.6%** smaller on first load and **93.8%** smaller overall. With a wallet modal, Konekt is **97.5%** smaller on first load and **95.9%** smaller overall than AppKit. The four apps live in `packages/size-walletconnect`, `packages/size-appkit`, `packages/size-konekt`, and `packages/size-konekt-ui`. They share React 19 and Vite; the AppKit app turns email, socials, swaps, on-ramp, and analytics off.

The library-only path is still **14.53 kB** through the first encrypted message (9.69 kB initially and a 4.84 kB lazy cipher chunk) plus **12.47 kB** for the wallet modal and styles, for a **27.00 kB** connect stack before React. That is the figure `pnpm size` enforces. The Vite table is what a browser actually downloads.

The [bundle size guide](../bundle-size/) documents both measurements. The [Konekt UI guide](../konekt-ui/) compares the UI packages directly, including wallet selection, pairing, account controls, theming, and the larger AppKit features Konekt intentionally leaves to the application.

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
