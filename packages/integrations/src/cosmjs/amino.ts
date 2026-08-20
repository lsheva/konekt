import type { AminoSignResponse, OfflineAminoSigner, StdFee, StdSignDoc } from "@cosmjs/amino";
import { asArray, asRecord, asString } from "../bytes.ts";
import type { RequestClient } from "../request.ts";
import { cosmosAccounts, cosmosRequest, parseStdSignature } from "./accounts.ts";

export function konektAminoSigner(
  client: RequestClient,
  options: { chainId?: string | undefined } = {},
): OfflineAminoSigner {
  const chainId = options.chainId;
  return {
    getAccounts: () => cosmosAccounts(client, chainId),
    async signAmino(signerAddress, signDoc): Promise<AminoSignResponse> {
      const result = await cosmosRequest(client, chainId)("cosmos_signAmino", {
        signerAddress,
        signDoc,
      });
      const body = asRecord(result, "cosmos_signAmino result");
      return {
        signed: parseAminoSignDoc(body.signed, signDoc),
        signature: parseStdSignature(body.signature, "cosmos_signAmino result.signature"),
      };
    },
  };
}

function parseAminoSignDoc(value: unknown, fallback: StdSignDoc): StdSignDoc {
  if (value === undefined) return fallback;
  const signed = asRecord(value, "cosmos_signAmino result.signed");
  const timeoutHeight = signed.timeout_height;
  return {
    chain_id: asString(signed.chain_id, "signed.chain_id"),
    account_number: asString(signed.account_number, "signed.account_number"),
    sequence: asString(signed.sequence, "signed.sequence"),
    fee: parseFee(signed.fee),
    msgs: asArray(signed.msgs, "signed.msgs").map((msg, index) => parseAminoMsg(msg, index)),
    memo: typeof signed.memo === "string" ? signed.memo : "",
    ...(typeof timeoutHeight === "string" ? { timeout_height: timeoutHeight } : {}),
  };
}

function parseFee(value: unknown): StdFee {
  const fee = asRecord(value, "signed.fee");
  return {
    amount: asArray(fee.amount, "signed.fee.amount").map((coin, index) => {
      const row = asRecord(coin, `signed.fee.amount[${index}]`);
      return {
        denom: asString(row.denom, `signed.fee.amount[${index}].denom`),
        amount: asString(row.amount, `signed.fee.amount[${index}].amount`),
      };
    }),
    gas: asString(fee.gas, "signed.fee.gas"),
    ...(typeof fee.granter === "string" ? { granter: fee.granter } : {}),
    ...(typeof fee.payer === "string" ? { payer: fee.payer } : {}),
  };
}

function parseAminoMsg(value: unknown, index: number) {
  const msg = asRecord(value, `signed.msgs[${index}]`);
  const body = msg.value;
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`signed.msgs[${index}].value must be an object`);
  }
  const record: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(body)) record[key] = entry;
  return { type: asString(msg.type, `signed.msgs[${index}].type`), value: record };
}
