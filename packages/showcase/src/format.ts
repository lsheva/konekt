import { keccak256, stringToHex, toHex } from "viem";
import { ProviderRpcError } from "konekt";

export function formatError(e: unknown): string {
  if (e instanceof ProviderRpcError) return `${e.name} ${e.code}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}

export function pretty(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  } catch {
    return String(value);
  }
}

export function utf8Hex(message: string): `0x${string}` {
  return stringToHex(message);
}

export function ethSignHash(message: string): `0x${string}` {
  return keccak256(toHex(message));
}

export function mailTypedData(chainId: number, address: string) {
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Mail: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "contents", type: "string" },
      ],
    },
    primaryType: "Mail",
    domain: {
      name: "konekt",
      version: "1",
      chainId,
      verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as const,
    },
    message: {
      from: address,
      to: address,
      contents: "konekt showcase",
    },
  };
}

export const explorers: Record<number, string> = {
  1: "https://etherscan.io",
  42161: "https://arbiscan.io",
  11155111: "https://sepolia.etherscan.io",
};
