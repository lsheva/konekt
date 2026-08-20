# konekt

[![npm](https://img.shields.io/npm/v/konekt)](https://www.npmjs.com/package/konekt)
[![license](https://img.shields.io/badge/license-ISC-blue)](./LICENSE)

A minimal, modular WalletConnect v2 provider for browser applications. Konekt gives your app an
[EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) provider backed by WalletConnect v2. It is
ESM-only and has no `@walletconnect` runtime dependency.

```sh
pnpm add konekt
```

```ts
import { Provider } from "konekt";
import { evm } from "konekt/eip155";

const provider = await Provider.init({
  projectId,
  metadata: { name: "App", description: "My app", url: location.origin, icons: [] },
  chains: evm(1),
});

provider.on("display_uri", showPairingUri);
await provider.connect();
```

Hand that provider to viem (`custom(provider)`), ethers v6 (`new BrowserProvider(provider)`), or a
small wagmi connector. For a React wallet picker and pairing QR, add
[`konekt-ui`](https://www.npmjs.com/package/konekt-ui).

## Why konekt

The modern-browser EVM path is 14.53 kB minified and gzipped through the first encrypted message,
against 142.97 kB for the main bundle of `@walletconnect/ethereum-provider@2.23.10`. Reads go to a
transport you configure rather than a default public endpoint, and the wallet UI is yours rather
than a bundled modal. See
[Why Konekt is better](https://lsheva.github.io/konekt/guides/why-konekt/) and the
[migration guide](https://lsheva.github.io/konekt/guides/migrate-ethereum-provider/).

## Entry points

Chain adapters, features, and HTTP reads are separate entry points so applications only bundle what
they use:

| Import | Contents |
| --- | --- |
| `konekt` | `Provider`, session and error types, `memoryStorage` |
| `konekt/eip155` | EVM chains through `evm(...ids, opts)` |
| `konekt/solana` | `solana`, `solanaDevnet`, `solanaTestnet`, `solanaChain` |
| `konekt/bip122` | `bitcoin`, `bitcoinTestnet`, `bitcoinSignet`, `bitcoinChain` |
| `konekt/cosmos` | `cosmoshub`, `osmosis`, `cosmosChain` |
| `konekt/generic` | `forwardingNamespace` for a custom namespace |
| `konekt/siwe` | One-click authentication during pairing |
| `konekt/cacao` | Server-side CACAO signature and claim verification |
| `konekt/http` | JSON-RPC read transport |

## Requirements

Konekt targets browsers. It needs Web Crypto in a secure context (HTTPS or `localhost`),
`WebSocket`, and a storage implementation. It is ESM-only, so `require()` will not load it. You also
need a WalletConnect project ID.

## Documentation

[lsheva.github.io/konekt](https://lsheva.github.io/konekt/) covers configuration, chains,
authentication, wallet redirects, server-side rendering, bundle size, and troubleshooting.

## License

[ISC](./LICENSE)
