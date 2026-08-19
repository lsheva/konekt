# wagmi v3 example

Same app as `titan/test-wagmi-v3`, with `konekt` in place of `@walletconnect/ethereum-provider`.

The capabilities lab is `packages/showcase`.

```bash
pnpm install
pnpm dev
```

Injected wallets are registered up front. konekt is registered on the first click so a visitor who
never pairs never opens a relay socket. The pairing URI is rendered here (`display_uri`); there is
no AppKit modal.
