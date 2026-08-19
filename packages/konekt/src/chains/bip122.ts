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

/** Shared adapter for chains created by {@link bitcoinChain}. */
export const bitcoinAdapter = adapter;
/** Creates a Bitcoin chain from its CAIP-2 reference, usually the genesis block hash prefix. */
export const bitcoinChain = chain;

/** Bitcoin mainnet. */
export const bitcoin = bitcoinChain("000000000019d6689c085ae165831e93");
/** Bitcoin testnet. */
export const bitcoinTestnet = bitcoinChain("000000000933ea01ad0ee984209779ba");
/** Bitcoin signet. */
export const bitcoinSignet = bitcoinChain("00000008819873e925422c1ff0f99f7c");
