import type { Chain } from "../kernel/plugin.ts";
import { forwardingNamespace } from "./generic.ts";

/** Solana methods proposed and forwarded by the built-in adapter. */
export const METHODS = [
  "solana_getAccounts",
  "solana_requestAccounts",
  "solana_signMessage",
  "solana_signTransaction",
  "solana_signAllTransactions",
  "solana_signAndSendTransaction",
] as const;

const { adapter, chain } = forwardingNamespace({ namespace: "solana", methods: METHODS });

/** Shared adapter for chains created by {@link solana}. */
export const solanaAdapter = adapter;

/**
 * Creates one Solana `Chain` for {@link Provider} configuration.
 *
 * Pass a CAIP-2 reference (usually the network's genesis hash) or a network definition with a
 * string `id`, such as AppKit's Solana networks.
 */
export function solana(ref: string | { id: string }): Chain {
  return chain(typeof ref === "string" ? ref : ref.id);
}

/** Solana mainnet-beta. */
export const solanaMainnet = chain("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
/** Solana devnet. */
export const solanaDevnet = chain("EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
/** Solana testnet. */
export const solanaTestnet = chain("4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z");
