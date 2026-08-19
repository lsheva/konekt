import { forwardingNamespace } from "./generic.ts";

export const METHODS = [
  "solana_getAccounts",
  "solana_requestAccounts",
  "solana_signMessage",
  "solana_signTransaction",
  "solana_signAllTransactions",
  "solana_signAndSendTransaction",
] as const;

const { adapter, chain } = forwardingNamespace({ namespace: "solana", methods: METHODS });

export const solanaAdapter = adapter;
export const solanaChain = chain;

export const solana = solanaChain("5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
export const solanaDevnet = solanaChain("EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
export const solanaTestnet = solanaChain("4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z");
