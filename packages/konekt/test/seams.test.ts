import assert from "node:assert/strict";
import { test } from "node:test";
import { bitcoinMainnet } from "../src/chains/bip122.ts";
import { evm } from "../src/chains/eip155.ts";
import { solanaMainnet } from "../src/chains/solana.ts";
import { Provider, ProviderRpcError, RpcErrorCode } from "../src/index.ts";
import type { Chain, ChainAdapter, Feature } from "../src/kernel/plugin.ts";
import type { Session } from "../src/kernel/types.ts";

const metadata = { name: "t", description: "", url: "https://t.local", icons: [] };

function stub(id = "stub:1"): Chain {
  const adapter: ChainAdapter = {
    namespace: "stub",
    methods: ["stub_echo"],
    events: [],
    handle(req, ctx) {
      if (req.method !== "stub_echo") return;
      return ctx.forward({ ...req, chainId: id });
    },
  };
  return { namespace: "stub", id, adapter };
}

function fakeSession(
  request: (req: { method: string; params?: unknown; chainId: string }) => Promise<unknown>,
  namespaces: Session["namespaces"],
) {
  const session: Session = {
    topic: "topic",
    pairingTopic: "pairing",
    relay: { protocol: "irn" },
    expiry: 0,
    namespaces,
    controller: "controller",
    self: { publicKey: "self", metadata },
    peer: { publicKey: "peer", metadata },
  };
  return {
    uri: undefined as string | undefined,
    session,
    connect: async () => session,
    restore: async () => false,
    request,
    disconnect: async () => {},
  };
}

test("stub adapter receives its namespace and not eip155 methods", async () => {
  const calls: { method: string; chainId: string }[] = [];
  const provider = await Provider.create(
    { projectId: "x", metadata, chains: [stub()] },
    {
      session: fakeSession(
        async (req) => {
          calls.push({ method: req.method, chainId: req.chainId });
          return `ok:${req.method}`;
        },
        { stub: { accounts: ["stub:1:xyz"], methods: ["stub_echo"], events: [] } },
      ),
    },
  );

  assert.equal(await provider.request({ method: "stub_echo" }), "ok:stub_echo");
  assert.deepEqual(calls, [{ method: "stub_echo", chainId: "stub:1" }]);
  assert.equal("chainId" in provider, false);

  await assert.rejects(
    () => provider.request({ method: "personal_sign", params: ["0x", "0x1"] }),
    (e: unknown) => e instanceof ProviderRpcError && e.code === RpcErrorCode.unsupportedMethod,
  );
  assert.equal(calls.length, 1);
});

test("requests route by namespace when both adapters are present", async () => {
  const calls: string[] = [];
  const provider = await Provider.create(
    { projectId: "x", metadata, chains: [evm(1), stub()] },
    {
      session: fakeSession(
        async (req) => {
          calls.push(`${req.chainId}:${req.method}`);
          return "ok";
        },
        {
          eip155: { accounts: ["eip155:1:0xabc"], methods: ["personal_sign"], events: [] },
          stub: { accounts: ["stub:1:xyz"], methods: ["stub_echo"], events: [] },
        },
      ),
    },
  );

  assert.equal(await provider.request({ method: "eth_chainId" }), "0x1");
  await provider.request({ method: "personal_sign", params: ["0x", "0xabc"] });
  await provider.request({ method: "stub_echo" });
  assert.deepEqual(calls, ["eip155:1:personal_sign", "stub:1:stub_echo"]);
});

test("eip155 and solana route in the same session", async () => {
  const calls: string[] = [];
  const provider = await Provider.create(
    { projectId: "x", metadata, chains: [evm(1), solanaMainnet] },
    {
      session: fakeSession(
        async (req) => {
          calls.push(`${req.chainId}:${req.method}`);
          return "ok";
        },
        {
          eip155: { accounts: ["eip155:1:0xabc"], methods: ["personal_sign"], events: [] },
          solana: { accounts: [`${solanaMainnet.id}:So111`], methods: [...solanaMainnet.adapter.methods], events: [] },
        },
      ),
    },
  );

  await provider.request({ method: "personal_sign", params: ["0x", "0xabc"] });
  await provider.request({ method: "solana_signMessage", params: { message: "x", pubkey: "So111" } });
  assert.deepEqual(calls, ["eip155:1:personal_sign", `${solanaMainnet.id}:solana_signMessage`]);
});

test("solana and bip122 methods forward on their CAIP-2 ids", async () => {
  const calls: string[] = [];
  const provider = await Provider.create(
    { projectId: "x", metadata, chains: [solanaMainnet, bitcoinMainnet] },
    {
      session: fakeSession(
        async (req) => {
          calls.push(`${req.chainId}:${req.method}`);
          return "ok";
        },
        {
          solana: { accounts: [`${solanaMainnet.id}:So111`], methods: [...solanaMainnet.adapter.methods], events: [] },
          bip122: { accounts: [`${bitcoinMainnet.id}:bc1q`], methods: [...bitcoinMainnet.adapter.methods], events: [] },
        },
      ),
    },
  );

  await provider.request({ method: "solana_signMessage", params: { message: "x", pubkey: "So111" } });
  await provider.request({
    method: "sendTransfer",
    params: { account: "bc1q", recipientAddress: "bc1q", amount: "1" },
  });
  await assert.rejects(
    () => provider.request({ method: "personal_sign" }),
    (e: unknown) => e instanceof ProviderRpcError && e.code === RpcErrorCode.unsupportedMethod,
  );
  assert.deepEqual(calls, [`${solanaMainnet.id}:solana_signMessage`, `${bitcoinMainnet.id}:sendTransfer`]);
});

test("switching chains moves both provider.chainId and where requests go", async () => {
  const calls: string[] = [];
  const provider = await Provider.create(
    { projectId: "x", metadata, chains: [evm(1), evm(8453)] },
    {
      session: fakeSession(
        async (req) => {
          calls.push(`${req.chainId}:${req.method}`);
          return "ok";
        },
        {
          eip155: {
            accounts: ["eip155:1:0xabc", "eip155:8453:0xabc"],
            methods: ["personal_sign", "wallet_switchEthereumChain"],
            events: [],
          },
        },
      ),
    },
  );

  assert.equal(provider.chainId, 1);
  assert.equal(await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] }), null);
  assert.equal(provider.chainId, 8453);
  assert.equal(await provider.request({ method: "eth_chainId" }), "0x2105");

  await provider.request({ method: "personal_sign", params: ["0x", "0xabc"] });
  assert.deepEqual(calls, ["eip155:8453:personal_sign"]);
});

test("an explicit chainId reaches an approved chain without moving the active one", async () => {
  const calls: string[] = [];
  const provider = await Provider.create(
    { projectId: "x", metadata, chains: [evm(1), evm(8453)] },
    {
      session: fakeSession(
        async (req) => {
          calls.push(`${req.chainId}:${req.method}`);
          return "ok";
        },
        {
          eip155: {
            accounts: ["eip155:1:0xabc", "eip155:8453:0xabc"],
            methods: ["personal_sign"],
            events: [],
          },
        },
      ),
    },
  );

  await provider.request({ method: "personal_sign", params: ["0x", "0xabc"] }, "eip155:8453");
  assert.equal(provider.chainId, 1);
  await provider.request({ method: "personal_sign", params: ["0x", "0xabc"] });
  assert.deepEqual(calls, ["eip155:8453:personal_sign", "eip155:1:personal_sign"]);
});

test("feature onDisconnect runs on provider.disconnect", async () => {
  let n = 0;
  const feature: Feature = { name: "spy", onDisconnect: () => n++ };
  const provider = await Provider.create(
    { projectId: "x", metadata, chains: [stub()], features: [feature] },
    { session: fakeSession(async () => null, { stub: { accounts: [], methods: ["stub_echo"], events: [] } }) },
  );
  await provider.disconnect();
  assert.equal(n, 1);
});

async function _stubHasNoChainId() {
  const provider = await Provider.create({ projectId: "x", metadata, chains: [stub()] });
  // @ts-expect-error EVM extensions require an eip155 chain
  provider.chainId;
  // @ts-expect-error EVM extensions require an eip155 chain
  provider.accounts;
}

async function _evmHasChainId() {
  const provider = await Provider.create({ projectId: "x", metadata, chains: [evm(1)] });
  provider.chainId;
  provider.accounts;
}

void _stubHasNoChainId;
void _evmHasChainId;
