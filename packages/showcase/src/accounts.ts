import { getAddress } from "viem";
import { accountsByChain, type Session } from "konekt";

export function firstAddress(session: Session | undefined, namespace: string): string {
  const byChain = accountsByChain(session?.namespaces);
  for (const [chainId, addresses] of Object.entries(byChain)) {
    if (chainId.startsWith(`${namespace}:`) && addresses[0]) return addresses[0];
  }
  return "";
}

export function evmAddresses(session: Session | undefined): `0x${string}`[] {
  const byChain = accountsByChain(session?.namespaces);
  const out: `0x${string}`[] = [];
  for (const [chainId, addresses] of Object.entries(byChain)) {
    if (!chainId.startsWith("eip155:")) continue;
    for (const address of addresses) {
      const checksummed = getAddress(address);
      if (!out.includes(checksummed)) out.push(checksummed);
    }
  }
  return out;
}
