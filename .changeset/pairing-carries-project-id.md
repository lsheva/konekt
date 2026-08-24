---
"konekt-ui": minor
---

The pairing now carries the WalletConnect project ID, so the UI components no longer take one:

- `Pairing` has an optional `projectId`. `useProviderPairing` reads it from the provider, and `useWagmiPairing` reads it from the registered Konekt connector, which now exposes its `projectId`.
- **Breaking:** `WalletModal` no longer accepts a `projectId` prop; it uses `pairing.projectId` for Wallet Explorer listings and shows a readable error when none is available.
- **Breaking:** `ConnectButton`'s `projectId` prop is now optional and only needed together with `getWalletConnect`, when no registered connector exists to read the ID from. `useWagmiPairing` accepts the same `projectId` option for that case.
