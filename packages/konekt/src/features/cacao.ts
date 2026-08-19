import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { concat, fromHex, fromUtf8, toHex } from "../kernel/bytes.ts";
import type { Cacao, CacaoPayload, RequestArguments } from "../kernel/types.ts";

/**
 * CAIP-74 CACAO verification, for the server that trusts the result. Pure and DOM-free, so a
 * backend can import it without pulling the provider in. The reference SDK does not verify on the
 * proposal-embedded path, which is why this exists at all.
 */

const NAMESPACE_NAMES: Record<string, string> = { eip155: "Ethereum", solana: "Solana", bip122: "Bitcoin" };

/** `isValidSignature(bytes32,bytes)`, doubling as the success value the contract echoes back. */
const EIP1271_MAGIC = "1626ba7e";

export type DidPkh = { namespace: string; reference: string; address: string };

/** `did:pkh:eip155:1:0xabc…` into its parts. */
export function parseDidPkh(iss: string): DidPkh | undefined {
  const [did, method, namespace, reference, address] = iss.split(":");
  if (did !== "did" || method !== "pkh") return;
  if (!namespace || !reference || !address) return;
  return { namespace, reference, address };
}

/** Per ERC-5573 the recap is always the last resource, so nothing else needs scanning. */
function recapOf(resources: string[] | undefined): string | undefined {
  const last = resources?.at(-1);
  return last?.startsWith("urn:recap:") ? last : undefined;
}

const RECAP_UNSUPPORTED =
  "Recap resources rewrite the statement before signing, and reconstructing that rewrite is not implemented.";

/**
 * The CAIP-122 message the wallet actually signed. Byte-identical to `formatMessage` in
 * `@walletconnect/utils`, which is the only reason a recovered address can match.
 */
export function formatCacaoMessage(payload: CacaoPayload, iss: string = payload.iss): string {
  const did = parseDidPkh(iss);
  if (!did) throw new Error(`Invalid issuer: ${iss}`);
  const target = payload.aud ?? payload.uri;
  if (!target) throw new Error("Either `aud` or `uri` is required to construct the message");
  if (recapOf(payload.resources)) throw new Error(RECAP_UNSUPPORTED);
  const { statement } = payload;
  if (statement && /\r|\n/.test(statement)) {
    // A newline here would let the statement forge the structured lines below it.
    throw new Error("Statement must not contain line breaks (`\\r` or `\\n`)");
  }
  return [
    `${payload.domain} wants you to sign in with your ${NAMESPACE_NAMES[did.namespace] ?? did.namespace} account:`,
    did.address,
    "",
    statement,
    "",
    `URI: ${target}`,
    `Version: ${payload.version}`,
    `Chain ID: ${did.reference}`,
    `Nonce: ${payload.nonce}`,
    `Issued At: ${payload.iat}`,
    payload.exp ? `Expiration Time: ${payload.exp}` : undefined,
    payload.nbf ? `Not Before: ${payload.nbf}` : undefined,
    payload.requestId ? `Request ID: ${payload.requestId}` : undefined,
    payload.resources ? `Resources:${payload.resources.map((r) => `\n- ${r}`).join("")}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

/**
 * `unverifiable` is not `invalid`. A caller must not log someone in on it, and must not accuse the
 * wallet of forging either; it means this process could not check, so a smart account with no RPC
 * reads differently from a bad signature.
 */
export type CacaoVerification =
  | { status: "valid" }
  | { status: "invalid"; reason: string }
  | { status: "unverifiable"; reason: string };

export type VerifyCacaoOptions = {
  /** JSON-RPC on the issuer's chain, needed only for eip1271. `http(url)` from `konekt/http` fits. */
  call?: ((req: RequestArguments) => Promise<unknown>) | undefined;
};

export async function verifyCacao(cacao: Cacao, opts: VerifyCacaoOptions = {}): Promise<CacaoVerification> {
  const did = parseDidPkh(cacao.p.iss);
  if (!did) return { status: "invalid", reason: `Malformed issuer "${cacao.p.iss}".` };
  if (recapOf(cacao.p.resources)) return { status: "unverifiable", reason: RECAP_UNSUPPORTED };

  let message: string;
  try {
    message = formatCacaoMessage(cacao.p, cacao.p.iss);
  } catch (e) {
    return { status: "invalid", reason: (e as Error).message };
  }

  if (cacao.s.t === "eip191") return verifyEip191(did.address, message, cacao.s.s);
  if (cacao.s.t === "eip1271") return verifyEip1271(did, message, cacao.s.s, opts.call);
  return {
    status: "unverifiable",
    reason: `Signature type "${cacao.s.t}" has no defined verifier. CAIP-74 only specifies eip191 and eip1271.`,
  };
}

function hashPersonalMessage(message: string): Uint8Array {
  const bytes = fromUtf8(message);
  return keccak_256(concat([fromUtf8(`\x19Ethereum Signed Message:\n${bytes.length}`), bytes]));
}

function recoverAddress(hash: Uint8Array, signature: string): string | undefined {
  const bytes = fromHex(signature);
  if (bytes.length !== 65) return;
  const v = bytes.at(-1);
  if (v === undefined) return;
  const recovery = v >= 27 ? v - 27 : v;
  if (recovery !== 0 && recovery !== 1) return;
  try {
    const recovered = secp256k1.Signature.fromCompact(toHex(bytes.slice(0, 64)))
      .addRecoveryBit(recovery)
      .recoverPublicKey(hash)
      .toBytes(false);
    return `0x${toHex(keccak_256(recovered.slice(1))).slice(-40)}`;
  } catch {
    return;
  }
}

function verifyEip191(address: string, message: string, signature: string): CacaoVerification {
  const recovered = recoverAddress(hashPersonalMessage(message), signature);
  if (!recovered) return { status: "invalid", reason: "Signature is not a recoverable secp256k1 signature." };
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return { status: "invalid", reason: `Signed by ${recovered}, but the payload claims ${address}.` };
  }
  return { status: "valid" };
}

const word = (n: number) => n.toString(16).padStart(64, "0");

/** `isValidSignature(bytes32 hash, bytes signature)` with the dynamic tail encoded by hand. */
function encodeIsValidSignature(hash: Uint8Array, signature: Uint8Array): string {
  const padded = new Uint8Array(Math.ceil(signature.length / 32) * 32);
  padded.set(signature);
  return `0x${EIP1271_MAGIC}${toHex(hash)}${word(64)}${word(signature.length)}${toHex(padded)}`;
}

async function verifyEip1271(
  did: DidPkh,
  message: string,
  signature: string,
  call: VerifyCacaoOptions["call"],
): Promise<CacaoVerification> {
  if (!call) {
    return {
      status: "unverifiable",
      reason: `eip1271 is a contract call. Pass { call: http(rpcUrl) } for ${did.namespace}:${did.reference}.`,
    };
  }
  const data = encodeIsValidSignature(hashPersonalMessage(message), fromHex(signature));
  let result: unknown;
  try {
    result = await call({ method: "eth_call", params: [{ to: did.address, data }, "latest"] });
  } catch (e) {
    // An RPC outage is not a forged signature, and must not read as one.
    return { status: "unverifiable", reason: `eth_call failed: ${(e as Error).message}` };
  }
  if (typeof result !== "string") return { status: "unverifiable", reason: "eth_call returned no data." };
  if (result.slice(2, 10) === EIP1271_MAGIC) return { status: "valid" };
  return { status: "invalid", reason: "The account contract rejected the signature." };
}

export type ExpectedClaims = {
  domain: string;
  nonce: string;
  /** Matched against `aud`, falling back to `uri`, when given. */
  uri?: string | undefined;
  now?: Date | undefined;
};

/**
 * The half of verification that is not cryptography. A valid signature over someone else's
 * challenge is still a replay, so a caller that checks only `verifyCacao` is not done.
 */
export function checkClaims(payload: CacaoPayload, expected: ExpectedClaims): CacaoVerification {
  const invalid = (reason: string): CacaoVerification => ({ status: "invalid", reason });
  if (payload.domain !== expected.domain) {
    return invalid(`Signed for domain "${payload.domain}", expected "${expected.domain}".`);
  }
  if (payload.nonce !== expected.nonce) return invalid("Nonce does not match the one issued.");
  const target = payload.aud ?? payload.uri;
  if (expected.uri !== undefined && target !== expected.uri) {
    return invalid(`Signed for URI "${target}", expected "${expected.uri}".`);
  }
  const now = expected.now ?? new Date();
  if (payload.exp && new Date(payload.exp) <= now) return invalid(`Expired at ${payload.exp}.`);
  if (payload.nbf && new Date(payload.nbf) > now) return invalid(`Not valid before ${payload.nbf}.`);
  return { status: "valid" };
}
