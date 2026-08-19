import { forwardingNamespace } from "./generic.ts";

/**
 * Cosmos methods proposed and forwarded by the built-in adapter.
 *
 * `cosmos_getAccounts` goes to the wallet because its result includes `algo` and `pubkey`, which a
 * CAIP-10 session account does not contain.
 */
export const METHODS = ["cosmos_getAccounts", "cosmos_signDirect", "cosmos_signAmino"] as const;

const { adapter, chain } = forwardingNamespace({ namespace: "cosmos", methods: METHODS });

/** Shared adapter for chains created by {@link cosmosChain}. */
export const cosmosAdapter = adapter;
/** Creates a Cosmos chain from a network reference such as `"cosmoshub-4"`. */
export const cosmosChain = chain;

/** Cosmos Hub mainnet (`cosmos:cosmoshub-4`). */
export const cosmoshub = cosmosChain("cosmoshub-4");
/** Osmosis mainnet (`cosmos:osmosis-1`). */
export const osmosis = cosmosChain("osmosis-1");
