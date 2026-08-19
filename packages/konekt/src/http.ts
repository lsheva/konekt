import { ProviderRpcError, type RequestArguments } from "./kernel/types.ts";

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
