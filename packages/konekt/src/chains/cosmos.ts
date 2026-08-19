import { forwardingNamespace } from "./generic.ts";

/** `cosmos_getAccounts` is forwarded, not answered locally: it returns `algo` and `pubkey`, which CAIP-10 does not carry. */
export const METHODS = ["cosmos_getAccounts", "cosmos_signDirect", "cosmos_signAmino"] as const;

const { adapter, chain } = forwardingNamespace({ namespace: "cosmos", methods: METHODS });

export const cosmosAdapter = adapter;
export const cosmosChain = chain;

export const cosmoshub = cosmosChain("cosmoshub-4");
export const osmosis = cosmosChain("osmosis-1");
