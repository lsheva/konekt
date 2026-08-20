import assert from "node:assert/strict";
import { test } from "node:test";
import type { StdSignDoc } from "@cosmjs/amino";
import { bytesToBase64 } from "../src/bytes.ts";
import { konektAminoSigner } from "../src/cosmjs/amino.ts";
import { encodeSignDoc, konektDirectSigner } from "../src/cosmjs/direct.ts";
import { recording } from "./helpers.ts";

const HUB = "cosmos:cosmoshub-4";
const OSMO = "cosmos:osmosis-1";
const ADDRESS = "cosmos1sguafvgmel6f880ryvq8efh9522p8zvmrzlcrq";
const PUBKEY_B64 = "AgSEjOuOr991QlHCORRmdE5ahVKeyBrmtgoYepCpQGOW";
const SIG = {
  pub_key: { type: "tendermint/PubKeySecp256k1", value: PUBKEY_B64 },
  signature: "AnTrXtS2lr9CBwhTpRa8ZlKcVR9PeIXGaTpvodyJU05QvRKVjIkQfOZl5JhdkfxCY+a6rhwCOYVcbKQTJlMw4w==",
};

const aminoDoc: StdSignDoc = {
  chain_id: "cosmoshub-4",
  account_number: "7",
  sequence: "54",
  fee: { amount: [{ denom: "uatom", amount: "1000" }], gas: "23000" },
  msgs: [{ type: "cosmos-sdk/MsgSend", value: { from_address: ADDRESS, amount: [{ denom: "uatom", amount: "1" }] } }],
  memo: "hello",
};

const bodyBytes = Uint8Array.from([1, 2, 3]);
const authInfoBytes = Uint8Array.from([4, 5, 6]);
const LARGE = 9007199254740993n;

test("cosmos_getAccounts requires algo, address, and a base64 pubkey", async () => {
  const client = recording(() => [{ algo: "secp256k1", address: ADDRESS, pubkey: PUBKEY_B64 }]);
  const accounts = await konektAminoSigner(client, { chainId: HUB }).getAccounts();
  const account = accounts[0];
  assert.equal(account?.address, ADDRESS);
  assert.equal(account?.algo, "secp256k1");
  assert.equal(bytesToBase64(account?.pubkey ?? new Uint8Array()), PUBKEY_B64);
  assert.deepEqual(client.calls[0], { method: "cosmos_getAccounts", params: {}, chainId: HUB });

  await assert.rejects(() => konektDirectSigner(recording(() => [{ address: ADDRESS }])).getAccounts(), /algo|pubkey/);
});

test("amino signer keeps WalletConnect method names and returns the wallet sign document", async () => {
  const signed = {
    ...aminoDoc,
    fee: { amount: [{ denom: "uatom", amount: "2000" }], gas: "23000" },
    memo: "wallet-edited",
  };
  const client = recording(() => ({ signature: SIG, signed }));
  const result = await konektAminoSigner(client, { chainId: HUB }).signAmino(ADDRESS, aminoDoc);
  assert.equal(result.signed.memo, "wallet-edited");
  assert.equal(result.signed.fee.amount[0]?.amount, "2000");
  assert.equal(result.signature.signature, SIG.signature);
  assert.equal(client.calls[0]?.method, "cosmos_signAmino");
  assert.equal(client.calls[0]?.chainId, HUB);
  assert.deepEqual(client.calls[0]?.params, { signerAddress: ADDRESS, signDoc: aminoDoc });
});

test("amino signer falls back to the input document when the wallet omits signed", async () => {
  const client = recording(() => ({ signature: SIG }));
  const result = await konektAminoSigner(client).signAmino(ADDRESS, aminoDoc);
  assert.deepEqual(result.signed, aminoDoc);
});

test("direct signer encodes bytes as base64 and account numbers as strings", async () => {
  const client = recording(() => ({
    signature: SIG,
    signed: {
      chainId: "osmosis-1",
      accountNumber: LARGE.toString(),
      bodyBytes: bytesToBase64(bodyBytes),
      authInfoBytes: bytesToBase64(authInfoBytes),
    },
  }));
  const result = await konektDirectSigner(client, { chainId: OSMO }).signDirect(ADDRESS, {
    bodyBytes,
    authInfoBytes,
    chainId: "osmosis-1",
    accountNumber: LARGE,
  });

  assert.equal(result.signed.accountNumber, LARGE);
  assert.deepEqual(result.signed.bodyBytes, bodyBytes);
  assert.equal(client.calls[0]?.method, "cosmos_signDirect");
  assert.equal(client.calls[0]?.chainId, OSMO);
  assert.deepEqual(client.calls[0]?.params, {
    signerAddress: ADDRESS,
    signDoc: {
      chainId: "osmosis-1",
      accountNumber: LARGE.toString(),
      bodyBytes: bytesToBase64(bodyBytes),
      authInfoBytes: bytesToBase64(authInfoBytes),
    },
  });
});

test("direct encoding does not use Number for large account numbers", () => {
  const encoded = encodeSignDoc({
    bodyBytes,
    authInfoBytes,
    chainId: "cosmoshub-4",
    accountNumber: LARGE,
  });
  assert.equal(encoded.accountNumber, "9007199254740993");
  assert.notEqual(BigInt(Number(encoded.accountNumber)), LARGE);
});

test("amino and direct factories expose only their own signing method", () => {
  const amino = konektAminoSigner(recording(() => []));
  const direct = konektDirectSigner(recording(() => []));
  assert.equal("signAmino" in amino, true);
  assert.equal("signDirect" in amino, false);
  assert.equal("signDirect" in direct, true);
  assert.equal("signAmino" in direct, false);
});

test("malformed cosmos responses are rejected", async () => {
  await assert.rejects(
    () =>
      konektAminoSigner(recording(() => ({ signature: { signature: SIG.signature } }))).signAmino(ADDRESS, aminoDoc),
    /pub_key/,
  );
  await assert.rejects(
    () =>
      konektDirectSigner(
        recording(() => ({ signature: SIG, signed: { chainId: "x", accountNumber: LARGE.toString() } })),
      ).signDirect(ADDRESS, { bodyBytes, authInfoBytes, chainId: "x", accountNumber: 1n }),
    /bodyBytes|authInfoBytes/,
  );
});
