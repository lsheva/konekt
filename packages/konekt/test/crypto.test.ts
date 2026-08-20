import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex, toHex } from "../src/kernel/bytes.ts";
import { createCrypto, decrypt, deriveSymKey, encrypt, hashKey, hashMessage } from "../src/kernel/crypto.ts";

const A = {
  privateKey: "1fb63fca5c6ac731246f2f069d3bc2454345d5208254aa8ea7bffc6d110c8862",
  publicKey: "ff7a7d5767c362b0a17ad92299ebdb7831dcbd9a56959c01368c7404543b3342",
};
const B = {
  privateKey: "36bf507903537de91f5e573666eaa69b1fa313974f23b2b59645f20fea505854",
  publicKey: "590c2c627be7af08597091ff80dd41f7fa28acd10ef7191d7e830e116d3a186a",
};
const SHARED = "9c87e48e69b33a613907515bcd5b1b4cc10bbaf15167b19804b00f0a9217e607";
const HASHED = "a492906ccc809a411bb53a84572b57329375378c6ad7566f3e1c688200123e77";
const SYM = "0653ca620c7b4990392e1c53c4a51c14a2840cd20f0f1524cf435b17b6fe988c";
const MESSAGE = JSON.stringify({ id: 1, jsonrpc: "2.0", method: "test_method", params: {} });
const IV = "717765636661617364616473";
const TYPE0 =
  "AHF3ZWNmYWFzZGFkc3paHoQ96/mLAdanVxi17icRXq+jyrqXA8ocVgGmryQZBFMg+uwgc8yLa43EOeY+IWEv84g8hn4L3Ncsgz6397sgNKnsNcL7A9k3Mg==";

test("deriveSymKey matches WalletConnect vectors", async () => {
  assert.equal(await deriveSymKey(A.privateKey, B.publicKey), SYM);
  assert.equal(await deriveSymKey(B.privateKey, A.publicKey), SYM);
});

test("hashKey hashes raw bytes, not the hex string", async () => {
  assert.equal(await hashKey(SHARED), HASHED);
  assert.notEqual(await hashKey(SHARED), await hashMessage(SHARED));
});

test("type-0 envelope encrypt/decrypt", async () => {
  const { encrypt: wcEncrypt, decrypt: wcDecrypt } = await import("@walletconnect/utils");
  const ours = await encrypt(SYM, MESSAGE, fromHex(IV));
  assert.equal(ours, TYPE0);
  assert.equal(await decrypt(SYM, TYPE0), MESSAGE);
  assert.equal(wcEncrypt({ symKey: SYM, message: MESSAGE, iv: IV }), TYPE0);
  assert.equal(wcDecrypt({ symKey: SYM, encoded: TYPE0 }), MESSAGE);
  assert.equal(toHex(fromHex(IV)), IV);
});

test("Web Crypto handles hashes, key agreement, and signatures without Noble", async () => {
  const unexpected = async (): Promise<never> => {
    throw new Error("unexpected fallback");
  };
  const native = createCrypto({
    subtle: crypto.subtle,
    randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    loadCurves: unexpected,
    loadHkdf: unexpected,
    loadSha2: unexpected,
    loadCipher: unexpected,
  });

  assert.equal(await native.hashKey(SHARED), HASHED);
  assert.equal(await native.deriveSymKey(A.privateKey, B.publicKey), SYM);
  const seed = fromHex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60");
  const key = await native.prepareEd25519(seed);
  assert.equal(toHex(key.publicKey), "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
});

test("lazy Noble fallback preserves standard and WalletConnect vectors", async () => {
  const loads = { curves: 0, hkdf: 0, sha2: 0, cipher: 0 };
  const fallback = createCrypto({
    subtle: undefined,
    randomBytes: (length) => new Uint8Array(length),
    loadCurves: async () => {
      loads.curves++;
      return import("@noble/curves/ed25519");
    },
    loadHkdf: async () => {
      loads.hkdf++;
      return import("@noble/hashes/hkdf");
    },
    loadSha2: async () => {
      loads.sha2++;
      return import("@noble/hashes/sha2");
    },
    loadCipher: async () => {
      loads.cipher++;
      return import("@noble/ciphers/chacha");
    },
  });

  assert.equal(await fallback.hashMessage("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await fallback.deriveSymKey(A.privateKey, B.publicKey), SYM);
  assert.equal(await fallback.encrypt(SYM, MESSAGE, fromHex(IV)), TYPE0);
  assert.equal(await fallback.decrypt(SYM, TYPE0), MESSAGE);

  const seed = fromHex("9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60");
  const key = await fallback.prepareEd25519(seed);
  assert.equal(toHex(key.publicKey), "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
  assert.equal(
    toHex(await key.sign(new Uint8Array())),
    "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
      "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
  );
  assert.deepEqual(loads, { curves: 1, hkdf: 1, sha2: 1, cipher: 1 });
});
