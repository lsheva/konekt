# konekt showcase

Capabilities lab for `konekt`: pairing, session, every EIP-1193 method the provider exposes,
kernel JSON-RPC reads, wallet redirects, and the event log.

The slimmer wagmi app is `packages/example`.

```bash
pnpm install
pnpm --filter showcase dev
```

Runs on port 5174. Connect with a WalletConnect wallet. Sepolia is included so you can send a
transaction without mainnet funds. `eth_sign` and `eth_signTransaction` are often rejected by
wallets; they are still on the board because the provider routes them.
