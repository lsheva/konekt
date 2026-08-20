import { bytesToBase58, bytesToBase64 } from "../src/bytes.ts";
import type { RequestClient } from "../src/request.ts";

export type Call = { method: string; params: unknown; chainId: string | undefined };

export function recording(handler: (call: Call) => unknown): RequestClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async request(args, chainId) {
      const call = { method: args.method, params: args.params, chainId };
      calls.push(call);
      return handler(call);
    },
  };
}

export const SIGNATURE_BYTES = new Uint8Array(64).fill(7);
export const SIGNATURE_B58 = bytesToBase58(SIGNATURE_BYTES);
export const TX_BYTES = Uint8Array.from([1, 2, 3, 4, 5]);
export const TX_B64 = bytesToBase64(TX_BYTES);
export const MESSAGE = new TextEncoder().encode("konekt");
