# konekt-ui

## 0.3.0

### Minor Changes

- 8e2d4e5: Open wallets by deep link on a phone. `WalletModal` now pairs as soon as it opens on a mobile browser and leaves for the wallet inside the tap that chose it, because WebKit drops a redirect to a custom scheme once the gesture has expired — previously an iPhone got a QR code it could not scan and no redirect at all. That view shows the wallet and an Open button in place of the QR, and the list hides wallets that advertised no mobile link.
  
  A pairing about to reach its deadline is replaced with a fresh one, on a timer and when a hidden tab comes back, so a modal left open still connects. `onDismiss` now also runs for such a discarded attempt.
  
  `useWagmiPairing` lists an injected connector only while its provider is in the browser, so mobile Safari with no extension no longer offers a dead "Installed" wallet, and a named EIP-6963 entry hides the generic one. The wagmi connector opens the wallet for `request_sent` only on a phone instead of navigating a desktop page to a native scheme.
  
  `walletHref` no longer substitutes one platform's link for the other: a listing with only desktop links falls back to the QR code on a phone. New exports: `walletLink`, `pairingExpiry`, and `pairingRefreshDelay`.

### Patch Changes

- fc4672b: Export `Avatar` and `truncateAddress` so a custom account chip can reuse the same disc and shortened hex as `ConnectButton`.

## 0.2.0

### Minor Changes

- f9a7186: The pairing now carries the WalletConnect project ID, so the UI components no longer take one:
  
  - `Pairing` has an optional `projectId`. `useProviderPairing` reads it from the provider, and `useWagmiPairing` reads it from the registered Konekt connector, which now exposes its `projectId`.
  - **Breaking:** `WalletModal` no longer accepts a `projectId` prop; it uses `pairing.projectId` for Wallet Explorer listings and shows a readable error when none is available.
  - **Breaking:** `ConnectButton`'s `projectId` prop is now optional and only needed together with `getWalletConnect`, when no registered connector exists to read the ID from. `useWagmiPairing` accepts the same `projectId` option for that case.

### Patch Changes

- a2f48b4: Accept React 18 and wagmi 2 as peers. The wagmi UI calls `useAccount` and `connect`, which wagmi 3 still exports as aliases of `useConnection` and `mutate`.
- Updated dependencies [43a38ba]
- Updated dependencies [f9a7186]
  - konekt@0.2.0

## 0.1.1

### Patch Changes

- eb616db: Publish the expanded package READMEs, extra npm keywords, and CHANGELOG.md in the tarball.
