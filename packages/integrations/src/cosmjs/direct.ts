import type { DirectSignResponse, OfflineDirectSigner } from "@cosmjs/proto-signing";
import type { SignDoc } from "cosmjs-types/cosmos/tx/v1beta1/tx.js";
import { asRecord, asString, base64ToBytes, bytesToBase64 } from "../bytes.ts";
import type { RequestClient } from "../request.ts";
import {
  accountNumberToString,
  cosmosAccounts,
  cosmosRequest,
  parseAccountNumber,
  parseStdSignature,
} from "./accounts.ts";

export function konektDirectSigner(
  client: RequestClient,
  options: { chainId?: string | undefined } = {},
): OfflineDirectSigner {
  const chainId = options.chainId;
  return {
    getAccounts: () => cosmosAccounts(client, chainId),
    async signDirect(signerAddress, signDoc): Promise<DirectSignResponse> {
      const result = await cosmosRequest(client, chainId)("cosmos_signDirect", {
        signerAddress,
        signDoc: encodeSignDoc(signDoc),
      });
      const body = asRecord(result, "cosmos_signDirect result");
      return {
        signed: parseSignedDoc(body.signed, signDoc),
        signature: parseStdSignature(body.signature, "cosmos_signDirect result.signature"),
      };
    },
  };
}

export function encodeSignDoc(signDoc: SignDoc) {
  return {
    chainId: signDoc.chainId,
    accountNumber: accountNumberToString(signDoc.accountNumber, "signDoc.accountNumber"),
    authInfoBytes: bytesToBase64(signDoc.authInfoBytes),
    bodyBytes: bytesToBase64(signDoc.bodyBytes),
  };
}

function parseSignedDoc(value: unknown, fallback: SignDoc): SignDoc {
  if (value === undefined) return fallback;
  const signed = asRecord(value, "cosmos_signDirect result.signed");
  return {
    chainId: asString(signed.chainId, "signed.chainId"),
    accountNumber: parseAccountNumber(signed.accountNumber, "signed.accountNumber"),
    authInfoBytes: decodeBytes(signed.authInfoBytes, "signed.authInfoBytes"),
    bodyBytes: decodeBytes(signed.bodyBytes, "signed.bodyBytes"),
  };
}

function decodeBytes(value: unknown, label: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  return base64ToBytes(asString(value, label), label);
}
