import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type CreateConnectorFn, WagmiProvider, createConfig, http } from "wagmi";
import { arbitrum, mainnet, sepolia } from "wagmi/chains";
import type { DebugEvent } from "konekt";
import { TTL } from "konekt";
import { debugBus } from "./debugBus";

const queryClient = new QueryClient();

const projectId = import.meta.env.WC_PROJECT_ID;
if (!projectId) throw new Error("WC_PROJECT_ID is required: copy .env.example to .env and add a project id.");

const metadata = {
  name: "konekt showcase",
  description: "Capabilities lab for the konekt WalletConnect v2 provider",
  url: typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
  icons: ["https://avatars.githubusercontent.com/u/37784886"],
};

export const RPC_URL = "https://ethereum-rpc.publicnode.com";

export const konektOptions = {
  projectId,
  metadata,
  rpcUrl: RPC_URL,
  ttl: TTL,
  onDebug: (e: DebugEvent) => debugBus.emit(e),
};

/** The showcase pairs a raw Provider, so wagmi only supplies chains and reads. */
const connectors: CreateConnectorFn[] = [];

export const config = createConfig({
  chains: [mainnet, sepolia, arbitrum],
  connectors,
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
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
