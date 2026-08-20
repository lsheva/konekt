# integrations

Application-owned bridges between `konekt` and the Solana and CosmJS client libraries.

**This package is not published.** The files here are meant to be copied into your app, not
installed. They are kept in the repository so they are type-checked and tested against the real
provider, which is what makes them safe to copy.

Konekt deliberately ships no `konekt/solana-client` or `konekt/cosmjs` wrapper. These libraries
change on their own schedule and their signer interfaces are opinionated, so the adapter belongs to
the application that picks the versions.

## What is here

```
src/
  bytes.ts            base58 and base64 helpers, response parsing
  request.ts          the RequestClient type the bridges take
  solana/
    rpc.ts            WalletConnect Solana method encoding
    web3.ts           @solana/web3.js wallet
    kit.ts            @solana/kit wallet
  cosmjs/
    accounts.ts       cosmos_getAccounts and signature parsing
    amino.ts          OfflineAminoSigner
    direct.ts         OfflineDirectSigner
```

Copy the files a bridge needs, keeping their relative layout. `bytes.ts` and `request.ts` are shared
by all of them. The guides list the exact set and the packages to install:

- [Solana](https://lsheva.github.io/konekt/guides/solana/)
- [CosmJS](https://lsheva.github.io/konekt/guides/cosmjs/)

## Tests

```sh
pnpm --filter integrations test
```

The tests cover wire encodings, CAIP-2 targeting, legacy and versioned Solana transactions, Amino
and direct Cosmos signing, large account numbers, and malformed wallet responses. They do not prove
that a particular mobile wallet implements every method.
