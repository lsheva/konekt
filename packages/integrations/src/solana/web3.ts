import { type PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import type { RequestClient } from "../request.ts";
import {
  type SolanaSendOptions,
  signAndSendSolanaTransaction,
  signSolanaMessage,
  signSolanaTransaction,
  signSolanaTransactions,
} from "./rpc.ts";

export type Web3Transaction = Transaction | VersionedTransaction;

export type KonektWeb3Wallet = {
  publicKey: PublicKey;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: <T extends Web3Transaction>(transaction: T) => Promise<T>;
  signAllTransactions: <T extends Web3Transaction>(transactions: T[]) => Promise<T[]>;
  signAndSendTransaction: (transaction: Web3Transaction, sendOptions?: SolanaSendOptions) => Promise<string>;
};

export function konektWeb3Wallet(
  client: RequestClient,
  options: { publicKey: PublicKey; chainId?: string | undefined },
): KonektWeb3Wallet {
  const chainId = options.chainId;
  const publicKey = options.publicKey;

  return {
    publicKey,
    signMessage: (message) => signSolanaMessage(client, message, publicKey.toBase58(), chainId),
    async signTransaction<T extends Web3Transaction>(transaction: T) {
      const signed = await signSolanaTransaction(client, serialize(transaction), chainId);
      return applySignature(transaction, publicKey, signed);
    },
    async signAllTransactions<T extends Web3Transaction>(transactions: T[]) {
      const signed = await signSolanaTransactions(
        client,
        transactions.map((transaction) => serialize(transaction)),
        chainId,
      );
      return transactions.map((transaction, index) => {
        const bytes = signed[index];
        if (!bytes) throw new Error(`solana_signAllTransactions omitted transaction ${index}`);
        return decodeAs(transaction, bytes);
      });
    },
    signAndSendTransaction: (transaction, sendOptions) =>
      signAndSendSolanaTransaction(client, serialize(transaction), sendOptions, chainId),
  };
}

export function serialize(transaction: Web3Transaction): Uint8Array {
  if (transaction instanceof VersionedTransaction) return transaction.serialize();
  return transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
}

function applySignature<T extends Web3Transaction>(
  transaction: T,
  publicKey: PublicKey,
  signed: { signature: Uint8Array; transaction: Uint8Array | undefined },
): T {
  if (signed.transaction) return decodeAs(transaction, signed.transaction);
  const next = clone(transaction);
  next.addSignature(publicKey, Buffer.from(signed.signature));
  return next;
}

function decodeAs<T extends Web3Transaction>(original: T, bytes: Uint8Array): T {
  if (original instanceof VersionedTransaction) {
    return VersionedTransaction.deserialize(bytes) as T;
  }
  try {
    return Transaction.from(bytes) as T;
  } catch {
    throw new Error("Wallet returned a versioned transaction for a legacy Transaction");
  }
}

function clone<T extends Web3Transaction>(transaction: T): T {
  if (transaction instanceof VersionedTransaction) {
    return VersionedTransaction.deserialize(transaction.serialize()) as T;
  }
  return Transaction.from(transaction.serialize({ requireAllSignatures: false, verifySignatures: false })) as T;
}
