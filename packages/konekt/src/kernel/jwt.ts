import { ed25519 } from "@noble/curves/ed25519";
import { concat, fromUtf8, toB58, toB64url } from "./bytes.ts";

const HEADER = { alg: "EdDSA", typ: "JWT" } as const;

/** Relay auth token lifetime in seconds (one day). */
export const JWT_TTL = 24 * 60 * 60;

export function generateEd25519(seed: Uint8Array) {
  return { seed, publicKey: ed25519.getPublicKey(seed) };
}

/** did:key:z + base58btc(0xed01 || pubkey) */
export function encodeIss(publicKey: Uint8Array): string {
  return `did:key:z${toB58(concat([new Uint8Array([0xed, 0x01]), publicKey]))}`;
}

export function signJwt(
  sub: string,
  aud: string,
  seed: Uint8Array,
  ttl = JWT_TTL,
  iat = (Date.now() / 1e3) | 0,
): string {
  const { publicKey } = generateEd25519(seed);
  const payload = { iss: encodeIss(publicKey), sub, aud, iat, exp: iat + ttl };
  const data = `${b64json(HEADER)}.${b64json(payload)}`;
  return `${data}.${toB64url(ed25519.sign(fromUtf8(data), seed))}`;
}

function b64json(v: unknown): string {
  return toB64url(fromUtf8(JSON.stringify(v)));
}
