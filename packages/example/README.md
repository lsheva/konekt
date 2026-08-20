# wagmi v3 example

A small wagmi 3 app using `konekt` for WalletConnect, with `konekt-ui`'s `ConnectButton` for the
wallet picker and account controls. There is no AppKit.

The capabilities lab is [`packages/showcase`](../showcase).

```bash
pnpm install
cp ../../.env.example ../../.env   # add WC_PROJECT_ID
pnpm dev
```

## What it demonstrates

- `src/konekt.ts` is the application-owned wagmi connector. Copy it as the starting point for your
  own; it is the implementation the
  [wagmi guide](https://lsheva.github.io/konekt/guides/wagmi/) describes.
- `src/Wagmi.tsx` builds the wagmi config with injected wallets registered up front.
- `src/Connect.tsx` registers the Konekt connector on the first click instead of in `createConfig()`,
  so a visitor who never pairs never downloads or initializes Konekt.

That last part uses `config._internal.connectors.setup()`, which is private wagmi API. It is a
deliberate trade-off for the initial-chunk saving. Static registration in `createConfig()` is the
recommended default, and the wagmi guide explains both.
