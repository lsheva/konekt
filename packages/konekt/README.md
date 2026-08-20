# konekt

A minimal, modular WalletConnect v2 provider for browser applications. Konekt is ESM-only and has no
`@walletconnect` runtime dependency.

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

Chain adapters, features, and HTTP reads are separate entry points so applications only bundle what
they use:

- `konekt/eip155`
- `konekt/solana`
- `konekt/bip122`
- `konekt/cosmos`
- `konekt/generic`
- `konekt/siwe`
- `konekt/cacao`
- `konekt/http`

See the [documentation](https://lsheva.github.io/konekt/) for configuration, authentication, wallet
redirects, and bundle-size guidance.

## License

[ISC](./LICENSE)
