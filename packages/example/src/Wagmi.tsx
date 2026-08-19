import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { arbitrum, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const queryClient = new QueryClient();

const projectId = import.meta.env.WC_PROJECT_ID;
if (!projectId) throw new Error("WC_PROJECT_ID is required: copy .env.example to .env and add a project id.");

const metadata = {
  name: "konekt wagmi example",
  description: "WalletConnect via konekt, without AppKit",
  url: "http://localhost:5173",
  icons: ["https://avatars.githubusercontent.com/u/37784886"],
};

export const konektOptions = { projectId, metadata };

export const config = createConfig({
  chains: [mainnet, arbitrum],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [arbitrum.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

export function ContextProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
