import assert from "node:assert/strict";
import { test } from "node:test";
import { bitcoin, bitcoinMainnet } from "../src/chains/bip122.ts";
import { cosmos, cosmoshub } from "../src/chains/cosmos.ts";
import { baseMainnet, ethereumMainnet, ethereumSepolia, evm } from "../src/chains/eip155.ts";
import { solana, solanaMainnet } from "../src/chains/solana.ts";

test("named chains carry their CAIP-2 ids and no read transport", () => {
  assert.equal(ethereumMainnet.id, "eip155:1");
  assert.equal(ethereumSepolia.id, "eip155:11155111");
  assert.equal(baseMainnet.id, "eip155:8453");
  assert.equal(solanaMainnet.id, "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp");
  assert.equal(bitcoinMainnet.id, "bip122:000000000019d6689c085ae165831e93");
  assert.equal(cosmoshub.id, "cosmos:cosmoshub-4");
  assert.equal(ethereumMainnet.read, undefined);
});

test("evm accepts a chain definition and derives read from its default HTTP URL", async () => {
  const definition = { id: 8453, rpcUrls: { default: { http: ["https://base.example-rpc.com"] } } };
  const chain = evm(definition);
  assert.equal(chain.id, "eip155:8453");
  assert.equal(typeof chain.read, "function");

  const seen: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    seen.push(String(input));
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }));
  };
  try {
    assert.equal(await chain.read?.({ method: "eth_chainId" }), "0x1");
    assert.deepEqual(seen, ["https://base.example-rpc.com"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("evm never derives a read transport for bare ids or url-less definitions", () => {
  assert.equal(evm(1).read, undefined);
  assert.equal(evm({ id: 1 }).read, undefined);
  assert.equal(evm({ id: 1, rpcUrls: { default: { http: [] } } }).read, undefined);
});

test("an explicit read overrides the definition's derived transport", () => {
  const read = async () => null;
  const definition = { id: 1, rpcUrls: { default: { http: ["https://eth.example-rpc.com"] } } };
  assert.equal(evm(definition, { read }).read, read);
  assert.equal(evm(1, { read }).read, read);
});

test("non-EVM factories accept references and definitions with a string id", () => {
  assert.equal(solana("4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z").id, "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z");
  assert.equal(solana({ id: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1" }).id, "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
  assert.equal(bitcoin({ id: "000000000019d6689c085ae165831e93" }).id, bitcoinMainnet.id);
  assert.equal(cosmos("juno-1").id, "cosmos:juno-1");
});
