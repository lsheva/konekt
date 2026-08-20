import assert from "node:assert/strict";
import { test } from "node:test";
import { fromHex } from "../src/kernel/bytes.ts";
import { encodeIss, generateEd25519, JWT_TTL, signJwt } from "../src/kernel/jwt.ts";

const SEED = fromHex("0000000000000000000000000000000000000000000000000000000000000001");

test("encodeIss matches @walletconnect/relay-auth", async () => {
  const { encodeIss: wcIss, generateKeyPair } = await import("@walletconnect/relay-auth");
  const { publicKey } = await generateEd25519(SEED);
  const wc = generateKeyPair(SEED);
  assert.equal(encodeIss(publicKey), wcIss(wc.publicKey));
  assert.ok(encodeIss(publicKey).startsWith("did:key:z"));
});

test("signJwt matches @walletconnect/relay-auth at a fixed iat", async () => {
  const { generateKeyPair, signJWT } = await import("@walletconnect/relay-auth");
  const kp = generateKeyPair(SEED);
  const iat = 1_700_000_000;
  const ours = await signJwt("subject", "https://relay.walletconnect.org", SEED, JWT_TTL, iat);
  const theirs = await signJWT("subject", "https://relay.walletconnect.org", JWT_TTL, kp, iat);
  assert.equal(ours, theirs);
});
