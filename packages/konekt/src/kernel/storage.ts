import { randomBytes } from "@noble/hashes/utils";
import { fromHex, toHex } from "./bytes.ts";

export type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export const STORE = {
  seed: "konekt:seed",
  keys: "konekt:keys",
  session: "konekt:session",
} as const;

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
