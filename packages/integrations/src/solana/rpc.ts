import {
  asArray,
  asRecord,
  asString,
  base58ToBytes,
  base64ToBytes,
  bytesToBase58,
  bytesToBase64,
  optionalString,
} from "../bytes.ts";
import type { RequestClient } from "../request.ts";

export type SolanaSendOptions = {
  skipPreflight?: boolean | undefined;
  preflightCommitment?: string | undefined;
  maxRetries?: number | undefined;
  minContextSlot?: number | undefined;
};

export type SignedSolanaTransaction = {
  signature: Uint8Array;
  transaction: Uint8Array | undefined;
};

export function solanaRequest(client: RequestClient, chainId: string | undefined) {
  return (method: string, params: unknown) => client.request({ method, params }, chainId);
}

export async function solanaPubkeys(client: RequestClient, chainId?: string): Promise<string[]> {
  const result = await solanaRequest(client, chainId)("solana_getAccounts", {});
  return asArray(result, "solana_getAccounts result").map((row, index) => {
    const account = asRecord(row, `solana_getAccounts result[${index}]`);
    return asString(account.pubkey, `solana_getAccounts result[${index}].pubkey`);
  });
}

export async function signSolanaMessage(
  client: RequestClient,
  message: Uint8Array,
  pubkey: string,
  chainId?: string,
): Promise<Uint8Array> {
  const result = await solanaRequest(client, chainId)("solana_signMessage", {
    message: bytesToBase58(message),
    pubkey,
  });
  const body = asRecord(result, "solana_signMessage result");
  return base58ToBytes(asString(body.signature, "solana_signMessage result.signature"), "solana_signMessage signature");
}

export async function signSolanaTransaction(
  client: RequestClient,
  transaction: Uint8Array,
  chainId?: string,
): Promise<SignedSolanaTransaction> {
  const result = await solanaRequest(client, chainId)("solana_signTransaction", {
    transaction: bytesToBase64(transaction),
  });
  return parseSignedTransaction(result, "solana_signTransaction");
}

export async function signSolanaTransactions(
  client: RequestClient,
  transactions: Uint8Array[],
  chainId?: string,
): Promise<Uint8Array[]> {
  const result = await solanaRequest(client, chainId)("solana_signAllTransactions", {
    transactions: transactions.map((transaction) => bytesToBase64(transaction)),
  });
  const body = asRecord(result, "solana_signAllTransactions result");
  const signed = asArray(body.transactions, "solana_signAllTransactions result.transactions");
  if (signed.length !== transactions.length) {
    throw new Error(
      `solana_signAllTransactions returned ${signed.length} transactions, expected ${transactions.length}`,
    );
  }
  return signed.map((row, index) =>
    base64ToBytes(asString(row, `solana_signAllTransactions result.transactions[${index}]`), "signed transaction"),
  );
}

export async function signAndSendSolanaTransaction(
  client: RequestClient,
  transaction: Uint8Array,
  sendOptions?: SolanaSendOptions,
  chainId?: string,
): Promise<string> {
  const params: Record<string, unknown> = { transaction: bytesToBase64(transaction) };
  if (sendOptions) params.sendOptions = sendOptions;
  const result = await solanaRequest(client, chainId)("solana_signAndSendTransaction", params);
  const body = asRecord(result, "solana_signAndSendTransaction result");
  return asString(body.signature, "solana_signAndSendTransaction result.signature");
}

export function parseSignedTransaction(result: unknown, label: string): SignedSolanaTransaction {
  const body = asRecord(result, `${label} result`);
  const signature = base58ToBytes(asString(body.signature, `${label} result.signature`), `${label} signature`);
  const encoded = optionalString(body.transaction, `${label} result.transaction`);
  return {
    signature,
    transaction: encoded === undefined ? undefined : base64ToBytes(encoded, `${label} transaction`),
  };
}
