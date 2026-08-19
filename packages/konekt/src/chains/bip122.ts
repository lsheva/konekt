import { forwardingNamespace } from "./generic.ts";

export const METHODS = [
  "sendTransfer",
  "getAccountAddresses",
  "signPsbt",
  "signMessage",
  "bip122_signTransaction",
] as const;
export const EVENTS = ["bip122_addressesChanged"] as const;

const { adapter, chain } = forwardingNamespace({ namespace: "bip122", methods: METHODS, events: EVENTS });

export const bitcoinAdapter = adapter;
export const bitcoinChain = chain;

export const bitcoin = bitcoinChain("000000000019d6689c085ae165831e93");
export const bitcoinTestnet = bitcoinChain("000000000933ea01ad0ee984209779ba");
export const bitcoinSignet = bitcoinChain("00000008819873e925422c1ff0f99f7c");
