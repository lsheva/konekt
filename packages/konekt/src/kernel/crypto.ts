import { chacha20poly1305 } from "@noble/ciphers/chacha";
import { x25519 } from "@noble/curves/ed25519";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";
import { randomBytes } from "@noble/hashes/utils";
import { concat, fromB64, fromHex, fromUtf8, toB64, toHex, toUtf8 } from "./bytes.ts";

export type KeyPair = { privateKey: string; publicKey: string };

export function randomHex32(): string {
  return toHex(randomBytes(32));
}

export function generateX25519(): KeyPair {
  const privateKey = x25519.utils.randomSecretKey();
  return { privateKey: toHex(privateKey), publicKey: toHex(x25519.getPublicKey(privateKey)) };
}

export function deriveSymKey(privateKey: string, publicKey: string): string {
  const shared = x25519.getSharedSecret(fromHex(privateKey), fromHex(publicKey));
  return toHex(hkdf(sha256, shared, undefined, undefined, 32));
}

/** sha256 of the key's raw bytes, not of the hex string. */
export function hashKey(key: string): string {
  return toHex(sha256(fromHex(key)));
}

export function hashMessage(message: string): string {
  return toHex(sha256(fromUtf8(message)));
}

export function encrypt(symKey: string, message: string, iv = randomBytes(12)): string {
  const sealed = chacha20poly1305(fromHex(symKey), iv).encrypt(fromUtf8(message));
  return toB64(concat([new Uint8Array([0]), iv, sealed]));
}

export function decrypt(symKey: string, encoded: string): string {
  const bytes = fromB64(encoded);
  const iv = bytes.subarray(1, 13);
  const sealed = bytes.subarray(13);
  const msg = chacha20poly1305(fromHex(symKey), iv).decrypt(sealed);
  if (!msg) throw new Error("decrypt failed");
  return toUtf8(msg);
}
