import type { Chain } from "../kernel/plugin.ts";
import { forwardingNamespace } from "./generic.ts";

/**
 * Cosmos methods proposed and forwarded by the built-in adapter.
 *
 * `cosmos_getAccounts` goes to the wallet because its result includes `algo` and `pubkey`, which a
 * CAIP-10 session account does not contain.
 */
export const METHODS = ["cosmos_getAccounts", "cosmos_signDirect", "cosmos_signAmino"] as const;

const { adapter, chain } = forwardingNamespace({ namespace: "cosmos", methods: METHODS });

/** Shared adapter for chains created by {@link cosmos}. */
export const cosmosAdapter = adapter;

/**
 * Creates one Cosmos `Chain` for {@link Provider} configuration.
 *
 * Pass a CAIP-2 reference (a network name such as `"cosmoshub-4"`) or a network definition with
 * a string `id`.
 */
export function cosmos(ref: string | { id: string }): Chain {
  return chain(typeof ref === "string" ? ref : ref.id);
}

/** Cosmos Hub mainnet (`cosmos:cosmoshub-4`). */
export const cosmoshub = chain("cosmoshub-4");
/** Osmosis mainnet (`cosmos:osmosis-1`). */
export const osmosis = chain("osmosis-1");
