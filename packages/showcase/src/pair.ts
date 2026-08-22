import type { Chain, Provider } from "konekt";
import { RPC_URL, konektOptions } from "./Wagmi";

export type PairKind = "evm" | "solana" | "bitcoin" | "cosmos";

const NAMESPACE_OF: Record<PairKind, string> = {
  evm: "eip155",
  solana: "solana",
  bitcoin: "bip122",
  cosmos: "cosmos",
};

/** The EVM chains mirror the wagmi config. Mainnet pins its RPC; the rest derive a public one from their definitions. */
async function evmChains(): Promise<Chain[]> {
  const { evm } = await import("konekt/eip155");
  const { http } = await import("konekt/http");
  const { mainnet, sepolia, arbitrum } = await import("viem/chains");
  return [evm(mainnet, { read: http(RPC_URL) }), evm(sepolia), evm(arbitrum)];
}

async function chainsOf(kind: PairKind): Promise<Chain[]> {
  if (kind === "evm") return evmChains();
  if (kind === "solana") {
    const { solanaMainnet } = await import("konekt/solana");
    return [solanaMainnet];
  }
  if (kind === "bitcoin") {
    const { bitcoinMainnet } = await import("konekt/bip122");
    return [bitcoinMainnet];
  }
  const { cosmoshub, osmosis } = await import("konekt/cosmos");
  return [cosmoshub, osmosis];
}

/** The CAIP-2 chains these kinds propose, in one session. The wallet list is filtered by the same ids. */
async function chainsFor(kinds: readonly PairKind[]): Promise<Chain[]> {
  const perKind = await Promise.all(kinds.map(chainsOf));
  return perKind.flat();
}

export type Challenge = { domain: string; uri: string; nonce: string };

let challenge: Challenge | undefined;

/** What the last pairing asked to be signed, so the panel can check the echo the way a server would. */
export function siweChallenge(): Challenge | undefined {
  return challenge;
}

async function authentication(chains: Chain[]) {
  const { siwe } = await import("konekt/siwe");
  const domain = window.location.host;
  const uri = `${window.location.origin}/login`;
  return siwe({
    domain,
    uri,
    // CACAOs are only verifiable for eip155 today; other namespaces have no defined signature type.
    chains: chains.filter((c) => c.namespace === "eip155").map((c) => c.id),
    getNonce: () => {
      const nonce = crypto.randomUUID().replaceAll("-", "");
      challenge = { domain, uri, nonce };
      return nonce;
    },
    statement: "Sign in to the konekt showcase.",
    // Most wallets are expected to ignore this, and the session is still worth having.
    required: false,
  });
}

export async function openProvider(
  kinds: readonly PairKind[],
  opts: { authenticate?: boolean } = {},
): Promise<Provider> {
  const { Provider } = await import("konekt");
  const chains = await chainsFor(kinds);
  if (!opts.authenticate) challenge = undefined;
  return Provider.create({
    projectId: konektOptions.projectId,
    metadata: konektOptions.metadata,
    chains,
    features: opts.authenticate ? [await authentication(chains)] : [],
    onDebug: konektOptions.onDebug,
    ttl: konektOptions.ttl,
  });
}

export async function restoreProvider(): Promise<Provider | undefined> {
  const { Provider } = await import("konekt");
  const { solanaMainnet } = await import("konekt/solana");
  const { bitcoinMainnet } = await import("konekt/bip122");
  const { cosmoshub, osmosis } = await import("konekt/cosmos");
  const provider = await Provider.create({
    projectId: konektOptions.projectId,
    metadata: konektOptions.metadata,
    chains: [await evmChains(), solanaMainnet, bitcoinMainnet, cosmoshub, osmosis],
    onDebug: konektOptions.onDebug,
    ttl: konektOptions.ttl,
  });
  return provider.connected ? provider : undefined;
}

const HINTS: Partial<Record<PairKind, string>> = {
  bitcoin: "Scan with a WalletConnect Bitcoin wallet, not MetaMask or an injected Xverse/Leather extension.",
  cosmos: "Scan with Keplr, Leap, or Cosmostation.",
};

/** Namespaces are all optional, so a wallet may settle a session that covers only some of them. */
export function missingNamespace(kinds: readonly PairKind[], session: Provider["session"]): string | undefined {
  if (!session) return "Wallet settled no session.";
  const declined = kinds.filter((k) => !session.namespaces[NAMESPACE_OF[k]]);
  if (!declined.length) return;
  const approved = kinds.filter((k) => !declined.includes(k)).map((k) => NAMESPACE_OF[k]);
  const hints = declined.map((k) => HINTS[k]).filter(Boolean);
  return [
    `Wallet did not approve ${declined.map((k) => NAMESPACE_OF[k]).join(", ")}.`,
    approved.length ? `It approved ${approved.join(", ")}.` : "",
    ...hints,
  ]
    .filter(Boolean)
    .join(" ");
}
