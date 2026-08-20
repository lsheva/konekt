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
    limit: "30 kB",
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
    name: "konekt-ui styles",
    path: "packages/konekt-ui/dist/styles.css",
    limit: "3.5 kB",
    gzip,
  },
] satisfies SizeLimitConfig;
