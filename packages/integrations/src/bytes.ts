import { base58, base64 } from "@scure/base";

export function bytesToBase64(bytes: Uint8Array): string {
  return base64.encode(bytes);
}

export function bytesToBase58(bytes: Uint8Array): string {
  return base58.encode(bytes);
}

export function base64ToBytes(value: string, label: string): Uint8Array {
  try {
    return base64.decode(value);
  } catch {
    throw new Error(`${label} is not valid base64`);
  }
}

export function base58ToBytes(value: string, label: string): Uint8Array {
  try {
    return base58.decode(value);
  } catch {
    throw new Error(`${label} is not valid base58`);
  }
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) out[key] = entry;
  return out;
}

export function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

export function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

export function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return asString(value, label);
}
