import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { bytesToBase58, bytesToBase64 } from "../src/bytes.ts";
import { konektKitWallet } from "../src/solana/kit.ts";
import {
  signAndSendSolanaTransaction,
  signSolanaMessage,
  signSolanaTransaction,
  signSolanaTransactions,
  solanaPubkeys,
} from "../src/solana/rpc.ts";
import { konektWeb3Wallet, serialize } from "../src/solana/web3.ts";
import { MESSAGE, recording, SIGNATURE_B58, SIGNATURE_BYTES, TX_B64, TX_BYTES } from "./helpers.ts";

const CHAIN = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const PUBKEY = "AqP3MyNwDP4L1GJKYhzmaAUdrjzpqJUZjahM7kHpgavm";
const payer = new PublicKey(PUBKEY);
const blockhash = "2bUz6wu3axM8cDDncLB5chWuZaoscSjnoMD2nVvC1swe";

test("solana_getAccounts reads pubkey strings and rejects malformed rows", async () => {
  const client = recording(() => [{ pubkey: PUBKEY }]);
  assert.deepEqual(await solanaPubkeys(client, CHAIN), [PUBKEY]);
  assert.deepEqual(client.calls, [{ method: "solana_getAccounts", params: {}, chainId: CHAIN }]);

  await assert.rejects(() => solanaPubkeys(recording(() => [{ address: PUBKEY }])), /pubkey/);
  await assert.rejects(() => solanaPubkeys(recording(() => PUBKEY)), /must be an array/);
});

test("solana_signMessage sends base58 bytes and returns a base58 signature", async () => {
  const client = recording(() => ({ signature: SIGNATURE_B58 }));
  const signature = await signSolanaMessage(client, MESSAGE, PUBKEY, CHAIN);
  assert.deepEqual(signature, SIGNATURE_BYTES);
  assert.deepEqual(client.calls, [
    {
      method: "solana_signMessage",
      params: { message: bytesToBase58(MESSAGE), pubkey: PUBKEY },
      chainId: CHAIN,
    },
  ]);
});

test("solana_signTransaction sends base64 wire bytes and keeps an optional signed transaction", async () => {
  const signedBytes = Uint8Array.from([9, 8, 7]);
  const client = recording(() => ({
    signature: SIGNATURE_B58,
    transaction: bytesToBase64(signedBytes),
  }));
  const signed = await signSolanaTransaction(client, TX_BYTES, DEVNET);
  assert.deepEqual(signed.signature, SIGNATURE_BYTES);
  assert.deepEqual(signed.transaction, signedBytes);
  assert.equal(client.calls[0]?.method, "solana_signTransaction");
  assert.equal(client.calls[0]?.chainId, DEVNET);
  assert.deepEqual(client.calls[0]?.params, { transaction: TX_B64 });
});

test("solana_signAllTransactions preserves order and count", async () => {
  const second = Uint8Array.from([6, 6, 6]);
  const client = recording(() => ({ transactions: [TX_B64, bytesToBase64(second)] }));
  const signed = await signSolanaTransactions(client, [TX_BYTES, second]);
  assert.deepEqual(signed, [TX_BYTES, second]);
  await assert.rejects(
    () =>
      signSolanaTransactions(
        recording(() => ({ transactions: [TX_B64] })),
        [TX_BYTES, second],
      ),
    /expected 2/,
  );
});

test("solana_signAndSendTransaction forwards sendOptions and a base58 signature", async () => {
  const client = recording(() => ({ signature: SIGNATURE_B58 }));
  const signature = await signAndSendSolanaTransaction(client, TX_BYTES, { skipPreflight: true }, CHAIN);
  assert.equal(signature, SIGNATURE_B58);
  assert.deepEqual(client.calls[0]?.params, {
    transaction: TX_B64,
    sendOptions: { skipPreflight: true },
  });
});

test("malformed signatures and encodings are rejected", async () => {
  await assert.rejects(
    () =>
      signSolanaMessage(
        recording(() => ({ signature: 1 })),
        MESSAGE,
        PUBKEY,
      ),
    /signature/,
  );
  await assert.rejects(
    () =>
      signSolanaTransaction(
        recording(() => ({ signature: SIGNATURE_B58, transaction: "@@@" })),
        TX_BYTES,
      ),
    /base64/,
  );
  await assert.rejects(
    () =>
      signSolanaMessage(
        recording(() => ({ signature: "0" })),
        MESSAGE,
        PUBKEY,
      ),
    /base58/,
  );
});

test("web3 legacy and versioned transactions round-trip through WalletConnect encodings", async () => {
  const legacy = legacyTx();
  const versioned = versionedTx();
  const signedLegacy = bytesToBase64(serialize(legacy));
  const signedVersioned = bytesToBase64(serialize(versioned));
  const client = recording((call) => {
    if (call.method === "solana_signTransaction") {
      const params = call.params as { transaction: string };
      return { signature: SIGNATURE_B58, transaction: params.transaction };
    }
    if (call.method === "solana_signAllTransactions") {
      return { transactions: (call.params as { transactions: string[] }).transactions };
    }
    throw new Error(call.method);
  });

  const wallet = konektWeb3Wallet(client, { publicKey: payer, chainId: CHAIN });
  const one = await wallet.signTransaction(legacy);
  const two = await wallet.signTransaction(versioned);
  const both = await wallet.signAllTransactions([legacy, versioned]);

  assert.equal(one instanceof Transaction, true);
  assert.equal(two instanceof VersionedTransaction, true);
  assert.equal(both[0] instanceof Transaction, true);
  assert.equal(both[1] instanceof VersionedTransaction, true);
  const first = client.calls[0];
  const second = client.calls[1];
  assert.ok(first);
  assert.ok(second);
  assert.equal((first.params as { transaction: string }).transaction, signedLegacy);
  assert.equal((second.params as { transaction: string }).transaction, signedVersioned);
  assert.equal(first.chainId, CHAIN);
});

test("web3 applies a detached signature when the wallet omits the signed transaction", async () => {
  const legacy = legacyTx();
  const wallet = konektWeb3Wallet(
    recording(() => ({ signature: SIGNATURE_B58 })),
    { publicKey: payer },
  );
  const signed = await wallet.signTransaction(legacy);
  assert.equal(
    signed.signatures.some((entry) => entry.signature?.equals(Buffer.from(SIGNATURE_BYTES))),
    true,
  );
});

test("kit wallet signs messages and returns wallet-provided transaction bytes", async () => {
  const client = recording((call) => {
    if (call.method === "solana_signMessage") return { signature: SIGNATURE_B58 };
    throw new Error(call.method);
  });
  const wallet = konektKitWallet(client, { address: PUBKEY, chainId: DEVNET });
  assert.deepEqual(await wallet.signMessage(MESSAGE), SIGNATURE_BYTES);
  const call = client.calls[0];
  assert.ok(call);
  assert.equal(call.chainId, DEVNET);
  assert.equal((call.params as { message: string }).message, bytesToBase58(MESSAGE));
});

function legacyTx() {
  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = blockhash;
  tx.add(SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 1 }));
  return tx;
}

function versionedTx() {
  const message = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 1 })],
  }).compileToV0Message();
  return new VersionedTransaction(message);
}
