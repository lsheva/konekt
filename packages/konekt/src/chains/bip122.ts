import type { Chain } from "../kernel/plugin.ts";
import { forwardingNamespace } from "./generic.ts";

/** Bitcoin methods proposed and forwarded by the built-in adapter. */
export const METHODS = [
  "sendTransfer",
  "getAccountAddresses",
  "signPsbt",
  "signMessage",
  "bip122_signTransaction",
] as const;
/** Bitcoin session events proposed and forwarded by the built-in adapter. */
export const EVENTS = ["bip122_addressesChanged"] as const;

const { adapter, chain } = forwardingNamespace({ namespace: "bip122", methods: METHODS, events: EVENTS });

/** Shared adapter for chains created by {@link bitcoin}. */
export const bitcoinAdapter = adapter;

/**
 * Creates one Bitcoin `Chain` for {@link Provider} configuration.
 *
 * Pass a CAIP-2 reference (usually the genesis block hash prefix) or a network definition with a
 * string `id`, such as AppKit's Bitcoin networks.
 */
export function bitcoin(ref: string | { id: string }): Chain {
  return chain(typeof ref === "string" ? ref : ref.id);
}

/** Bitcoin mainnet. */
export const bitcoinMainnet = chain("000000000019d6689c085ae165831e93");
/** Bitcoin testnet. */
export const bitcoinTestnet = chain("000000000933ea01ad0ee984209779ba");
/** Bitcoin signet. */
export const bitcoinSignet = chain("00000008819873e925422c1ff0f99f7c");
