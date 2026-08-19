import { type EvmExt, evm } from "../src/chains/eip155.ts";
import { http } from "../src/http.ts";
import { type CreateProviderOptions, Provider } from "../src/index.ts";
import { DEFAULT_RELAY_URL, relays } from "../src/kernel/relay.ts";
import type { Storage } from "../src/kernel/storage.ts";
import { WalletPeer } from "./wallet.ts";

export const METADATA = {
  name: "test-dapp",
  description: "konekt",
  url: "https://dapp.local",
  icons: ["https://dapp.local/icon.png"],
};

export const WC_PROJECT_ID = process.env.WC_PROJECT_ID ?? process.env.TEST_PROJECT_ID;
export const WC_RELAY_URL = process.env.WC_RELAY_URL ?? DEFAULT_RELAY_URL;

type EvmProvider = Provider & EvmExt;

export type ConnectedOpts = Pick<CreateProviderOptions, "storage" | "onDebug" | "ttl" | "features"> & {
  delayMs?: number;
  signal?: AbortSignal;
};

export async function connected(
  t: { after: (fn: () => unknown) => void },
  chains: number[] = [1],
  rpcUrl?: string,
  extra: ConnectedOpts = {},
) {
  if (!WC_PROJECT_ID) throw new Error("WC_PROJECT_ID is required");
  const chainId = chains[0];
  if (chainId === undefined) throw new Error("UNSUPPORTED_CHAINS");
  const relayUrl = WC_RELAY_URL;
  const projectId = WC_PROJECT_ID;
  let wallet: WalletPeer | undefined;
  let provider: EvmProvider | undefined;
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    const relay = provider ? relays.get(provider) : undefined;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1500);
      void (async () => {
        await provider?.disconnect().catch(() => {});
        await wallet?.close().catch(() => {});
        clearTimeout(timer);
        resolve();
      })();
    });
    await relay?.close().catch(() => {});
  };
  t.after(close);
  const { delayMs, signal, ...providerOpts } = extra;
  wallet = await WalletPeer.create({
    relayUrl,
    projectId,
    chainId,
    rpcUrl,
    delayMs,
  });
  provider = await Provider.create({
    projectId,
    metadata: METADATA,
    chains: rpcUrl ? evm(...chains, { read: http(rpcUrl) }) : evm(...chains),
    relayUrl,
    ...providerOpts,
  });
  const ctx = { provider, wallet, relay: { url: relayUrl }, close };
  try {
    provider.on("display_uri", (uri) => {
      void wallet?.pair(uri).catch((e) => console.error("wallet pair failed", e));
    });
    await provider.connect({ signal });
    return ctx;
  } catch (e) {
    await ctx.close();
    throw e;
  }
}

export async function freshProvider(opts: { chains?: number[]; storage?: Storage | null } = {}): Promise<EvmProvider> {
  if (!WC_PROJECT_ID) throw new Error("WC_PROJECT_ID is required");
  return Provider.create({
    projectId: WC_PROJECT_ID,
    metadata: METADATA,
    chains: evm(...(opts.chains ?? [1])),
    relayUrl: WC_RELAY_URL,
    storage: opts.storage,
  });
}
