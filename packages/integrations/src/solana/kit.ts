import { getTransactionDecoder, getTransactionEncoder, type SignatureBytes, type Transaction } from "@solana/kit";
import type { RequestClient } from "../request.ts";
import {
  type SolanaSendOptions,
  signAndSendSolanaTransaction,
  signSolanaMessage,
  signSolanaTransaction,
  signSolanaTransactions,
} from "./rpc.ts";

export type KonektKitWallet = {
  address: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  signAllTransactions: (transactions: Transaction[]) => Promise<Transaction[]>;
  signAndSendTransaction: (transaction: Transaction, sendOptions?: SolanaSendOptions) => Promise<string>;
};

export function konektKitWallet(
  client: RequestClient,
  options: { address: string; chainId?: string | undefined },
): KonektKitWallet {
  const chainId = options.chainId;
  const address = options.address;
  const encoder = getTransactionEncoder();
  const decoder = getTransactionDecoder();

  const encode = (transaction: Transaction) => Uint8Array.from(encoder.encode(transaction));
  const decode = (bytes: Uint8Array) => decoder.decode(bytes);

  return {
    address,
    signMessage: (message) => signSolanaMessage(client, message, address, chainId),
    async signTransaction(transaction) {
      const signed = await signSolanaTransaction(client, encode(transaction), chainId);
      if (signed.transaction) return decode(signed.transaction);
      return withSignature(transaction, address, signed.signature);
    },
    async signAllTransactions(transactions) {
      const signed = await signSolanaTransactions(client, transactions.map(encode), chainId);
      return signed.map(decode);
    },
    signAndSendTransaction: (transaction, sendOptions) =>
      signAndSendSolanaTransaction(client, encode(transaction), sendOptions, chainId),
  };
}

function withSignature(transaction: Transaction, address: string, signature: Uint8Array): Transaction {
  return {
    ...transaction,
    signatures: {
      ...transaction.signatures,
      [address]: signature as SignatureBytes,
    },
  };
}
