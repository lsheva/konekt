# konekt-ui

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
