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

/** Shared adapter for chains created by {@link solanaChain}. */
export const solanaAdapter = adapter;
/** Creates a Solana chain from its CAIP-2 reference, usually the network's genesis hash. */
export const solanaChain = chain;

/** Solana mainnet-beta. */
export const solana = solanaChain("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
/** Solana devnet. */
export const solanaDevnet = solanaChain("EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
/** Solana testnet. */
export const solanaTestnet = solanaChain("4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z");
