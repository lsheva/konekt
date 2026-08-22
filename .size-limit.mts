import type { SizeLimitConfig } from "size-limit";

const gzip = true;

export default [
  {
    name: "Provider + EVM",
    path: ["packages/konekt/dist/index.js", "packages/konekt/dist/chains/eip155.js"],
    import: {
      "packages/konekt/dist/index.js": "{ Provider }",
      "packages/konekt/dist/chains/eip155.js": "{ evm }",
    },
    modifyEsbuildConfig(config) {
      if (!config) throw new Error("Missing esbuild configuration");
      const external = "external" in config && Array.isArray(config.external) ? config.external : [];
      return Object.assign(config, { external: [...external, "@noble/*"] });
    },
    limit: "11 kB",
    gzip,
  },
  {
    name: "Crypto curves fallback",
    path: "packages/konekt/node_modules/@noble/curves/esm/ed25519.js",
    import: "{ ed25519, x25519 }",
    limit: "15.5 kB",
    gzip,
  },
  {
    name: "Crypto hashes fallback",
    path: [
      "packages/konekt/node_modules/@noble/hashes/esm/hkdf.js",
      "packages/konekt/node_modules/@noble/hashes/esm/sha2.js",
    ],
    import: {
      "packages/konekt/node_modules/@noble/hashes/esm/hkdf.js": "{ hkdf }",
      "packages/konekt/node_modules/@noble/hashes/esm/sha2.js": "{ sha256 }",
    },
    limit: "4 kB",
    gzip,
  },
  {
    name: "Crypto cipher fallback",
    path: "packages/konekt/node_modules/@noble/ciphers/esm/chacha.js",
    import: "{ chacha20poly1305 }",
    limit: "6 kB",
    gzip,
  },
  {
    name: "HTTP read transport",
    path: "packages/konekt/dist/http.js",
    import: "{ http }",
    limit: "300 B",
    gzip,
  },
  {
    name: "SIWE feature",
    path: "packages/konekt/dist/features/siwe.js",
    import: "{ siwe, cacaosOf }",
    limit: "1 kB",
    gzip,
  },
  {
    name: "CACAO verifier",
    path: "packages/konekt/dist/features/cacao.js",
    import: "{ verifyCacao, checkClaims }",
    limit: "20 kB",
    gzip,
  },
  {
    name: "Solana adapter",
    path: "packages/konekt/dist/chains/solana.js",
    import: "{ solana, solanaChain }",
    limit: "900 B",
    gzip,
  },
  {
    name: "Wallet modal",
    path: "packages/konekt-ui/dist/index.js",
    import: "{ WalletModal, useProviderPairing }",
    ignore: ["react", "react-dom"],
    limit: "11 kB",
    gzip,
  },
  {
    name: "wagmi connect UI",
    path: "packages/konekt-ui/dist/wagmi/index.js",
    import: "{ ConnectButton }",
    ignore: ["react", "react-dom", "viem", "wagmi"],
    limit: "12.5 kB",
    gzip,
  },
  {
    name: "wagmi connector",
    path: "packages/konekt-ui/dist/wagmi/index.js",
    import: "{ konekt, abortPairing }",
    ignore: ["react", "react-dom", "viem", "wagmi", "konekt", "konekt/eip155"],
    limit: "1.3 kB",
    gzip,
  },
  {
    name: "Solana wallet discovery",
    path: "packages/konekt-ui/dist/wallet-standard/index.js",
    import: "{ useWalletStandardSource }",
    ignore: ["react", "react-dom"],
    limit: "1 kB",
    gzip,
  },
  {
    name: "Cosmos wallet discovery",
    path: "packages/konekt-ui/dist/cosmos/index.js",
    import: "{ useCosmosSource }",
    ignore: ["react", "react-dom"],
    limit: "1 kB",
    gzip,
  },
  {
    name: "konekt-ui styles",
    path: "packages/konekt-ui/dist/styles.css",
    limit: "3.5 kB",
    gzip,
  },
] satisfies SizeLimitConfig;
