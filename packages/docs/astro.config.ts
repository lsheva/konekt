import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLlmsTxt from "starlight-llms-txt";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

const pages = process.env.GITHUB_ACTIONS === "true";
const owner = process.env.GITHUB_REPOSITORY_OWNER ?? "localhost";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "konekt";
const isUserSite = repo === `${owner}.github.io`;
const base = pages && !isUserSite ? `/${repo}` : "/";
const site = pages ? `https://${owner}.github.io` : "http://localhost:4321";
const origin = `${site}${base === "/" ? "" : base}`;

const barrels = [
  "../konekt/src/index.ts",
  "../konekt/src/chains/eip155.ts",
  "../konekt/src/chains/solana.ts",
  "../konekt/src/chains/bip122.ts",
  "../konekt/src/chains/cosmos.ts",
  "../konekt/src/chains/generic.ts",
  "../konekt/src/features/siwe.ts",
  "../konekt/src/features/cacao.ts",
  "../konekt/src/http.ts",
  "../konekt-ui/src/index.ts",
  "../konekt-ui/src/wagmi/index.ts",
];

export default defineConfig({
  site,
  base,
  integrations: [
    starlight({
      title: "konekt",
      description: "Connect browser apps to WalletConnect wallets with a small, modular provider.",
      editLink: {
        baseUrl: "https://github.com/lsheva/konekt/edit/master/packages/docs/",
      },
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/lsheva/konekt" }],
      sidebar: [
        {
          label: "Guides",
          items: [
            { label: "Getting started", slug: "guides/getting-started" },
            { label: "Chains and networks", slug: "guides/chains" },
            { label: "Authentication", slug: "guides/features" },
            { label: "Wallet UI", slug: "guides/wallet-ui" },
            { label: "konekt-ui", slug: "guides/konekt-ui" },
            { label: "Bundle size and loading", slug: "guides/bundle-size" },
          ],
        },
        {
          label: "Integrations",
          items: [
            { label: "viem", slug: "guides/viem" },
            { label: "wagmi", slug: "guides/wagmi" },
          ],
        },
        {
          label: "For agents",
          items: [{ label: "System prompt", slug: "ai" }],
        },
        typeDocSidebarGroup,
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints: barrels,
          tsconfig: "./typedoc.tsconfig.json",
          watch: process.argv.includes("dev"),
          sidebar: { label: "API", collapsed: true },
          typeDoc: {
            skipErrorChecking: true,
            excludePrivate: true,
            excludeInternal: true,
            disableSources: true,
            readme: "none",
            githubPages: false,
          },
        }),
        starlightLlmsTxt({
          projectName: "konekt",
          description:
            "A small, modular WalletConnect v2 provider for browser apps. Browser ESM with no @walletconnect runtime.",
          details:
            "If you are an AI coding assistant integrating this library, read /ai first, then fetch the matching SKILL.md. Apps call Provider.init; tests call Provider.create. Chains are Chain objects from adapters, not numeric ids. Viem uses custom(provider); wagmi uses an application-owned connector. Features are proposal hooks, not request wrappers. SIWE asks and binds in the browser; the server must call both verifyCacao and checkClaims.",
          promote: ["index*", "guides/getting-started*", "guides/bundle-size*", "guides/viem*", "guides/wagmi*", "ai*"],
          exclude: ["api/**"],
          optionalLinks: [
            {
              label: "konekt skill",
              url: `${origin}/skills/konekt/SKILL.md`,
              description: "Integrate Provider.init, chains, features, and wallet events",
            },
            {
              label: "konekt-ui skill",
              url: `${origin}/skills/konekt-ui/SKILL.md`,
              description: "WalletModal and the wagmi ConnectButton",
            },
          ],
        }),
      ],
    }),
  ],
});
