import { concat, fromB64, fromHex, fromUtf8, toB64, toHex, toUtf8 } from "./bytes.ts";

export type KeyPair = { privateKey: string; publicKey: string };

type Curves = typeof import("@noble/curves/ed25519");
type Hkdf = typeof import("@noble/hashes/hkdf");
type Sha2 = typeof import("@noble/hashes/sha2");
type Cipher = typeof import("@noble/ciphers/chacha");

export type CryptoRuntime = {
  subtle: SubtleCrypto | undefined;
  randomBytes: (length: number) => Uint8Array;
  loadCurves: () => Promise<Curves>;
  loadHkdf: () => Promise<Hkdf>;
  loadSha2: () => Promise<Sha2>;
  loadCipher: () => Promise<Cipher>;
};

const X25519_PKCS8 = fromHex("302e020100300506032b656e04220420");
const ED25519_PKCS8 = fromHex("302e020100300506032b657004220420");
const EMPTY = new Uint8Array();

function platformRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  globalThis.crypto.getRandomValues(out);
  return out;
}

const defaultRuntime: CryptoRuntime = {
  subtle: globalThis.crypto?.subtle,
  randomBytes: platformRandomBytes,
  loadCurves: () => import("@noble/curves/ed25519"),
  loadHkdf: () => import("@noble/hashes/hkdf"),
  loadSha2: () => import("@noble/hashes/sha2"),
  loadCipher: () => import("@noble/ciphers/chacha"),
};

function pkcs8(prefix: Uint8Array, key: Uint8Array): Uint8Array {
  return concat([prefix, key]);
}

function buffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function jwkBytes(jwk: JsonWebKey, field: "d" | "x"): Uint8Array {
  const value = jwk[field];
  if (!value) throw new Error(`Web Crypto did not export ${field}`);
  return fromB64(value);
}

function supported(probe: () => Promise<unknown>): () => Promise<boolean> {
  let result: Promise<boolean> | undefined;
  return () => {
    result ??= probe().then(
      () => true,
      () => false,
    );
    return result;
  };
}

function cached<T>(load: () => Promise<T>): () => Promise<T> {
  let result: Promise<T> | undefined;
  return () => {
    result ??= load().catch((error) => {
      result = undefined;
      throw error;
    });
    return result;
  };
}

export function createCrypto(runtime: CryptoRuntime = defaultRuntime) {
  const subtle = runtime.subtle;
  const loadCurves = cached(runtime.loadCurves);
  const loadHkdf = cached(runtime.loadHkdf);
  const loadSha2 = cached(runtime.loadSha2);
  const loadCipher = cached(runtime.loadCipher);

  const hasSha256 = supported(async () => {
    if (!subtle) throw new Error("Web Crypto unavailable");
    await subtle.digest("SHA-256", buffer(EMPTY));
  });

  const hasHkdf = supported(async () => {
    if (!subtle) throw new Error("Web Crypto unavailable");
    const key = await subtle.importKey("raw", buffer(new Uint8Array(32)), "HKDF", false, ["deriveBits"]);
    await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: EMPTY, info: EMPTY }, key, 256);
  });

  const hasX25519 = supported(async () => {
    if (!subtle) throw new Error("Web Crypto unavailable");
    const pair = (await subtle.generateKey("X25519", true, ["deriveBits"])) as CryptoKeyPair;
    const privateJwk = await subtle.exportKey("jwk", pair.privateKey);
    const publicRaw = await subtle.exportKey("raw", pair.publicKey);
    const privateKey = await subtle.importKey(
      "pkcs8",
      buffer(pkcs8(X25519_PKCS8, jwkBytes(privateJwk, "d"))),
      "X25519",
      false,
      ["deriveBits"],
    );
    const publicKey = await subtle.importKey("raw", publicRaw, "X25519", false, []);
    await subtle.deriveBits({ name: "X25519", public: publicKey }, privateKey, 256);
  });

  const hasEd25519 = supported(async () => {
    if (!subtle) throw new Error("Web Crypto unavailable");
    const key = await subtle.importKey("pkcs8", buffer(pkcs8(ED25519_PKCS8, new Uint8Array(32))), "Ed25519", true, [
      "sign",
    ]);
    const jwk = await subtle.exportKey("jwk", key);
    jwkBytes(jwk, "x");
    await subtle.sign("Ed25519", key, buffer(EMPTY));
  });

  async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
    if (subtle && (await hasSha256())) {
      return new Uint8Array(await subtle.digest("SHA-256", buffer(bytes)));
    }
    const { sha256: fallback } = await loadSha2();
    return fallback(bytes);
  }

  async function hkdfSha256(shared: Uint8Array): Promise<Uint8Array> {
    if (subtle && (await hasHkdf())) {
      const key = await subtle.importKey("raw", buffer(shared), "HKDF", false, ["deriveBits"]);
      const bits = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: EMPTY, info: EMPTY }, key, 256);
      return new Uint8Array(bits);
    }
    const [{ hkdf }, { sha256: fallback }] = await Promise.all([loadHkdf(), loadSha2()]);
    return hkdf(fallback, shared, undefined, undefined, 32);
  }

  async function generateX25519(): Promise<KeyPair> {
    if (subtle && (await hasX25519())) {
      const pair = (await subtle.generateKey("X25519", true, ["deriveBits"])) as CryptoKeyPair;
      const privateJwk = await subtle.exportKey("jwk", pair.privateKey);
      const publicKey = await subtle.exportKey("raw", pair.publicKey);
      return { privateKey: toHex(jwkBytes(privateJwk, "d")), publicKey: toHex(new Uint8Array(publicKey)) };
    }
    const { x25519 } = await loadCurves();
    const privateKey = x25519.utils.randomSecretKey();
    return { privateKey: toHex(privateKey), publicKey: toHex(x25519.getPublicKey(privateKey)) };
  }

  async function x25519Shared(privateKey: string, publicKey: string): Promise<Uint8Array> {
    if (subtle && (await hasX25519())) {
      const privateCryptoKey = await subtle.importKey(
        "pkcs8",
        buffer(pkcs8(X25519_PKCS8, fromHex(privateKey))),
        "X25519",
        false,
        ["deriveBits"],
      );
      const publicCryptoKey = await subtle.importKey("raw", buffer(fromHex(publicKey)), "X25519", false, []);
      return new Uint8Array(
        await subtle.deriveBits({ name: "X25519", public: publicCryptoKey }, privateCryptoKey, 256),
      );
    }
    const { x25519 } = await loadCurves();
    return x25519.getSharedSecret(fromHex(privateKey), fromHex(publicKey));
  }

  async function prepareEd25519(seed: Uint8Array) {
    if (subtle && (await hasEd25519())) {
      const key = await subtle.importKey("pkcs8", buffer(pkcs8(ED25519_PKCS8, seed)), "Ed25519", true, ["sign"]);
      const publicKey = jwkBytes(await subtle.exportKey("jwk", key), "x");
      return {
        publicKey,
        sign: async (message: Uint8Array) => new Uint8Array(await subtle.sign("Ed25519", key, buffer(message))),
      };
    }
    const { ed25519 } = await loadCurves();
    return {
      publicKey: ed25519.getPublicKey(seed),
      sign: async (message: Uint8Array) => ed25519.sign(message, seed),
    };
  }

  async function encrypt(symKey: string, message: string, iv = runtime.randomBytes(12)): Promise<string> {
    const { chacha20poly1305 } = await loadCipher();
    const sealed = chacha20poly1305(fromHex(symKey), iv).encrypt(fromUtf8(message));
    return toB64(concat([new Uint8Array([0]), iv, sealed]));
  }

  async function decrypt(symKey: string, encoded: string): Promise<string> {
    const bytes = fromB64(encoded);
    const iv = bytes.subarray(1, 13);
    const sealed = bytes.subarray(13);
    const { chacha20poly1305 } = await loadCipher();
    const message = chacha20poly1305(fromHex(symKey), iv).decrypt(sealed);
    if (!message) throw new Error("decrypt failed");
    return toUtf8(message);
  }

  return {
    randomBytes: runtime.randomBytes,
    randomHex32: () => toHex(runtime.randomBytes(32)),
    generateX25519,
    deriveSymKey: async (privateKey: string, publicKey: string) =>
      toHex(await hkdfSha256(await x25519Shared(privateKey, publicKey))),
    hashKey: async (key: string) => toHex(await sha256(fromHex(key))),
    hashMessage: async (message: string) => toHex(await sha256(fromUtf8(message))),
    prepareEd25519,
    encrypt,
    decrypt,
  };
}

const crypto = createCrypto();

export const randomBytes = crypto.randomBytes;
export const randomHex32 = crypto.randomHex32;
export const generateX25519 = crypto.generateX25519;
export const deriveSymKey = crypto.deriveSymKey;
/** sha256 of the key's raw bytes, not of the hex string. */
export const hashKey = crypto.hashKey;
export const hashMessage = crypto.hashMessage;
export const prepareEd25519 = crypto.prepareEd25519;
export const encrypt = crypto.encrypt;
export const decrypt = crypto.decrypt;
