import type { Algo } from "@cosmjs/amino";
import { asArray, asRecord, asString, base64ToBytes } from "../bytes.ts";
import type { RequestClient } from "../request.ts";

const ALGOS: ReadonlySet<string> = new Set(["secp256k1", "ed25519", "sr25519", "eth_secp256k1", "ethsecp256k1"]);

export function cosmosRequest(client: RequestClient, chainId: string | undefined) {
  return (method: string, params: unknown) => client.request({ method, params }, chainId);
}

export async function cosmosAccounts(client: RequestClient, chainId?: string) {
  const result = await cosmosRequest(client, chainId)("cosmos_getAccounts", {});
  return asArray(result, "cosmos_getAccounts result").map((row, index) => parseAccount(row, index));
}

export function parseAccount(value: unknown, index: number) {
  const row = asRecord(value, `cosmos_getAccounts result[${index}]`);
  return {
    address: asString(row.address, `cosmos_getAccounts result[${index}].address`),
    algo: parseAlgo(row.algo, index),
    pubkey: base64ToBytes(asString(row.pubkey, `cosmos_getAccounts result[${index}].pubkey`), "account pubkey"),
  };
}

export function parseStdSignature(value: unknown, label: string) {
  const signature = asRecord(value, label);
  const pubKey = asRecord(signature.pub_key, `${label}.pub_key`);
  return {
    pub_key: {
      type: asString(pubKey.type, `${label}.pub_key.type`),
      value: asString(pubKey.value, `${label}.pub_key.value`),
    },
    signature: asString(signature.signature, `${label}.signature`),
  };
}

export function accountNumberToString(value: bigint | number | string, label: string): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    if (!/^[0-9]+$/.test(value)) throw new Error(`${label} must be an unsigned integer`);
    return value;
  }
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a safe unsigned integer`);
  return String(value);
}

export function parseAccountNumber(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`${label} must be unsigned`);
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a safe unsigned integer`);
    return BigInt(value);
  }
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return BigInt(value);
  throw new Error(`${label} must be an unsigned integer string`);
}

function parseAlgo(value: unknown, index: number): Algo {
  if (typeof value === "string" && ALGOS.has(value)) return value as Algo;
  throw new Error(`cosmos_getAccounts result[${index}].algo is missing or unsupported`);
}
