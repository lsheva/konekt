import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex, toHex } from "../src/kernel/bytes.ts";
import { decrypt, deriveSymKey, encrypt, hashKey, hashMessage } from "../src/kernel/crypto.ts";

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

test("deriveSymKey matches WalletConnect vectors", () => {
  assert.equal(deriveSymKey(A.privateKey, B.publicKey), SYM);
  assert.equal(deriveSymKey(B.privateKey, A.publicKey), SYM);
});

test("hashKey hashes raw bytes, not the hex string", () => {
  assert.equal(hashKey(SHARED), HASHED);
  assert.notEqual(hashKey(SHARED), hashMessage(SHARED));
});

test("type-0 envelope encrypt/decrypt", async () => {
  const { encrypt: wcEncrypt, decrypt: wcDecrypt } = await import("@walletconnect/utils");
  const ours = encrypt(SYM, MESSAGE, fromHex(IV));
  assert.equal(ours, TYPE0);
  assert.equal(decrypt(SYM, TYPE0), MESSAGE);
  assert.equal(wcEncrypt({ symKey: SYM, message: MESSAGE, iv: IV }), TYPE0);
  assert.equal(wcDecrypt({ symKey: SYM, encoded: TYPE0 }), MESSAGE);
  assert.equal(toHex(fromHex(IV)), IV);
});
