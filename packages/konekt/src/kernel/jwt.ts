import { concat, fromUtf8, toB58, toB64url } from "./bytes.ts";
import { prepareEd25519 } from "./crypto.ts";

const HEADER = { alg: "EdDSA", typ: "JWT" } as const;

/** Relay auth token lifetime in seconds (one day). */
export const JWT_TTL = 24 * 60 * 60;

export async function generateEd25519(seed: Uint8Array) {
  const { publicKey } = await prepareEd25519(seed);
  return { seed, publicKey };
}

/** did:key:z + base58btc(0xed01 || pubkey) */
export function encodeIss(publicKey: Uint8Array): string {
  return `did:key:z${toB58(concat([new Uint8Array([0xed, 0x01]), publicKey]))}`;
}

export async function signJwt(
  sub: string,
  aud: string,
  seed: Uint8Array,
  ttl = JWT_TTL,
  iat = (Date.now() / 1e3) | 0,
): Promise<string> {
  const key = await prepareEd25519(seed);
  const { publicKey } = key;
  const payload = { iss: encodeIss(publicKey), sub, aud, iat, exp: iat + ttl };
  const data = `${b64json(HEADER)}.${b64json(payload)}`;
  return `${data}.${toB64url(await key.sign(fromUtf8(data)))}`;
}

function b64json(v: unknown): string {
  return toB64url(fromUtf8(JSON.stringify(v)));
}
