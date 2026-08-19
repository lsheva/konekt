const gzip = true;

export default [
  {
    name: "Provider + EVM",
    path: ["packages/konekt/src/index.ts", "packages/konekt/src/chains/eip155.ts"],
    import: {
      "packages/konekt/src/index.ts": "{ Provider }",
      "packages/konekt/src/chains/eip155.ts": "{ evm }",
    },
    limit: "30 kB",
    gzip,
  },
  {
    name: "HTTP read transport",
    path: "packages/konekt/src/http.ts",
    import: "{ http }",
    limit: "300 B",
    gzip,
  },
  {
    name: "SIWE feature",
    path: "packages/konekt/src/features/siwe.ts",
    import: "{ siwe, cacaosOf }",
    limit: "1 kB",
    gzip,
  },
  {
    name: "CACAO verifier",
    path: "packages/konekt/src/features/cacao.ts",
    import: "{ verifyCacao, checkClaims }",
    limit: "20 kB",
    gzip,
  },
  {
    name: "Solana adapter",
    path: "packages/konekt/src/chains/solana.ts",
    import: "{ solana, solanaChain }",
    limit: "900 B",
    gzip,
  },
  {
    name: "Wallet modal",
    path: "packages/konekt-ui/src/index.ts",
    import: "{ WalletModal, useProviderPairing }",
    ignore: ["react", "react-dom"],
    limit: "11 kB",
    gzip,
  },
  {
    name: "wagmi connect UI",
    path: "packages/konekt-ui/src/wagmi/index.ts",
    import: "{ ConnectButton }",
    ignore: ["react", "react-dom", "viem", "wagmi"],
    limit: "12.5 kB",
    gzip,
  },
  {
    name: "konekt-ui styles",
    path: "packages/konekt-ui/src/styles.css",
    limit: "3.5 kB",
    gzip,
  },
];
