import { fromHex, toHex } from "./bytes.ts";
import { randomBytes } from "./crypto.ts";

/**
 * Asynchronous key-value storage used for the relay identity and session.
 *
 * The shape is compatible with wrappers around browser storage, mobile storage, and test stores.
 */
export type Storage = {
  /** Reads a value, returning `null` when the key does not exist. */
  getItem(key: string): Promise<string | null>;
  /** Creates or replaces a value. */
  setItem(key: string, value: string): Promise<void>;
  /** Removes a value. */
  removeItem(key: string): Promise<void>;
};

export const STORE = {
  seed: "konekt:seed",
  keys: "konekt:keys",
  session: "konekt:session",
} as const;

/**
 * Creates non-persistent storage backed by a new in-memory map.
 *
 * Each call returns an isolated store. Data disappears when the object is discarded.
 */
export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
  };
}

export function defaultStorage(): Storage {
  if (typeof localStorage === "undefined") return memoryStorage();
  return {
    getItem: async (k) => localStorage.getItem(k),
    setItem: async (k, v) => localStorage.setItem(k, v),
    removeItem: async (k) => localStorage.removeItem(k),
  };
}

export async function loadSeed(storage: Storage): Promise<Uint8Array> {
  const hex = await storage.getItem(STORE.seed);
  if (hex) return fromHex(hex);
  const seed = randomBytes(32);
  await storage.setItem(STORE.seed, toHex(seed));
  return seed;
}
