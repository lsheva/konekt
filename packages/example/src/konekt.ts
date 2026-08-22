import { getAddress, numberToHex } from "viem";
import type { CreateProviderOptions, Provider } from "konekt";
import type { EvmExt } from "konekt/eip155";
import { createConnector } from "wagmi";

export type KonektParameters = Pick<CreateProviderOptions, "projectId" | "metadata" | "relayUrl">;

type EvmProvider = Provider & EvmExt;

konekt.type = "konekt";

let pairingAbort: AbortController | undefined;

export function abortPairing() {
  pairingAbort?.abort();
}

export function konekt(parameters: KonektParameters) {
  return createConnector((config) => {
    let provider: EvmProvider | undefined;
    let accountsChanged: ((accounts: string[]) => void) | undefined;
    let chainChanged: ((chainId: `0x${string}`) => void) | undefined;
    let disconnected: (() => void) | undefined;
    let requestSent: ((e: { url: string | undefined }) => void) | undefined;

    const getProvider = async (): Promise<EvmProvider> => {
      if (!provider) {
        const { Provider } = await import("konekt");
        const { evm } = await import("konekt/eip155");
        provider = await Provider.init({
          projectId: parameters.projectId,
          metadata: parameters.metadata,
          chains: config.chains.map((c) => evm(c)),
          relayUrl: parameters.relayUrl,
        });
      }
      return provider;
    };

    const listen = (p: EvmProvider) => {
      if (!accountsChanged) {
        accountsChanged = (accounts) => {
          if (accounts.length === 0) config.emitter.emit("disconnect");
          else config.emitter.emit("change", { accounts: accounts.map((x) => getAddress(x)) });
        };
        p.on("accountsChanged", accountsChanged);
      }
      if (!chainChanged) {
        chainChanged = (chainId) => {
          config.emitter.emit("change", { chainId: Number(chainId) });
        };
        p.on("chainChanged", chainChanged);
      }
      if (!disconnected) {
        disconnected = () => config.emitter.emit("disconnect");
        p.on("disconnect", disconnected);
      }
      if (!requestSent) {
        requestSent = ({ url }) => {
          if (url) window.location.assign(url);
        };
        p.on("request_sent", requestSent);
      }
    };

    const unlisten = (p: EvmProvider) => {
      if (accountsChanged) p.off("accountsChanged", accountsChanged);
      if (chainChanged) p.off("chainChanged", chainChanged);
      if (disconnected) p.off("disconnect", disconnected);
      if (requestSent) p.off("request_sent", requestSent);
      accountsChanged = undefined;
      chainChanged = undefined;
      disconnected = undefined;
      requestSent = undefined;
    };

    return {
      id: "konekt",
      name: "konekt",
      type: konekt.type,

      async connect<withCapabilities extends boolean = false>({
        chainId,
        withCapabilities,
      }: {
        chainId?: number;
        isReconnecting?: boolean;
        withCapabilities?: withCapabilities | boolean;
      } = {}) {
        const p = await getProvider();
        const onDisplayUri = (uri: string) => {
          config.emitter.emit("message", { type: "display_uri", data: uri });
        };
        p.on("display_uri", onDisplayUri);
        pairingAbort = new AbortController();
        try {
          if (!p.connected) await p.connect({ signal: pairingAbort.signal });
          const accounts = p.accounts.map((x) => getAddress(x));
          let currentChainId = p.chainId;
          if (chainId && currentChainId !== chainId) {
            const chain = config.chains.find((c) => c.id === chainId);
            if (chain) {
              await p.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: numberToHex(chainId) }],
              });
              currentChainId = p.chainId;
            }
          }
          listen(p);
          return {
            accounts: (withCapabilities
              ? accounts.map((address) => ({ address, capabilities: {} }))
              : accounts) as never,
            chainId: currentChainId,
          };
        } finally {
          pairingAbort = undefined;
          p.off("display_uri", onDisplayUri);
        }
      },

      async disconnect() {
        const p = await getProvider();
        unlisten(p);
        await p.disconnect();
      },

      async getAccounts() {
        return (await getProvider()).accounts.map((x) => getAddress(x));
      },

      async getChainId() {
        return (await getProvider()).chainId;
      },

      getProvider,

      async isAuthorized() {
        try {
          const p = await getProvider();
          return p.connected && p.accounts.length > 0;
        } catch {
          return false;
        }
      },

      async switchChain({ chainId }: { chainId: number }) {
        const chain = config.chains.find((c) => c.id === chainId);
        if (!chain) throw new Error(`Chain ${chainId} is not configured.`);
        const p = await getProvider();
        await p.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: numberToHex(chainId) }],
        });
        return chain;
      },

      onAccountsChanged() {},
      onChainChanged() {},
      onDisconnect() {
        config.emitter.emit("disconnect");
      },
    };
  });
}
