import { ProviderRpcError, type RequestArguments } from "./kernel/types.ts";

/**
 * Creates a JSON-RPC HTTP transport for EVM read methods.
 *
 * Pass the result to `evm(id, { read })`. The URL must serve the same network as that EVM chain.
 * This transport is used for routed `eth_*`, `net_*`, and `web3_*` reads; it is never a fallback
 * for signing, transactions, or unknown methods.
 *
 * JSON-RPC error responses become {@link ProviderRpcError} instances with the server's code and
 * message.
 *
 * @example
 * ```ts
 * import { evm } from "konekt/eip155";
 * import { http } from "konekt/http";
 *
 * const ethereum = evm(1, { read: http(ethereumRpcUrl) });
 * ```
 *
 * @param url HTTP or HTTPS JSON-RPC endpoint.
 * @returns A call function compatible with `EvmOpts.read` and `VerifyCacaoOptions.call`.
 */
export function http(url: string) {
  return async ({ method, params }: RequestArguments): Promise<unknown> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method, params: params ?? [] }),
    });
    const json = (await res.json()) as { result?: unknown; error?: { code: number; message: string } };
    if (json.error) throw new ProviderRpcError(json.error.code, json.error.message);
    return json.result;
  };
}
