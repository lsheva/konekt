import assert from "node:assert/strict";
import { test } from "node:test";
import { cosmoshub, osmosis } from "../src/chains/cosmos.ts";
import { evm } from "../src/chains/eip155.ts";
import { Provider, type ProviderEvents, ProviderRpcError, RpcErrorCode } from "../src/index.ts";
import type { Session } from "../src/kernel/types.ts";

const metadata = { name: "t", description: "", url: "https://t.local", icons: [] };

const HUB = "cosmos1eeyudtn5p30jek85tq0cyh7k0jnn2z4t84y58y";
const OSMO = "osmo1fg2nemunucn496fewakqfe0mllcqfulrmjnj77";

const cosmosNamespaces: Session["namespaces"] = {
  cosmos: {
    accounts: [`${cosmoshub.id}:${HUB}`, `${osmosis.id}:${OSMO}`],
    methods: [...cosmoshub.adapter.methods],
    events: [],
  },
};

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

function recording(namespaces: Session["namespaces"] = cosmosNamespaces) {
  const calls: string[] = [];
  const session = fakeSession(async (req) => {
    calls.push(`${req.chainId}:${req.method}`);
    return "ok";
  }, namespaces);
  return { calls, session };
}

test("cosmos methods forward on the first configured chain", async () => {
  const { calls, session } = recording();
  const provider = await Provider.create({ projectId: "x", metadata, chains: [cosmoshub, osmosis] }, { session });

  await provider.request({ method: "cosmos_getAccounts" });
  await provider.request({ method: "cosmos_signAmino", params: { signerAddress: HUB, signDoc: {} } });
  assert.deepEqual(calls, [`${cosmoshub.id}:cosmos_getAccounts`, `${cosmoshub.id}:cosmos_signAmino`]);
});

test("an explicit chainId targets osmosis without moving the active chain", async () => {
  const { calls, session } = recording();
  const provider = await Provider.create({ projectId: "x", metadata, chains: [cosmoshub, osmosis] }, { session });

  await provider.request({ method: "cosmos_signDirect", params: { signerAddress: OSMO } }, osmosis.id);
  await provider.request({ method: "cosmos_signDirect", params: { signerAddress: HUB } });
  assert.deepEqual(calls, [`${osmosis.id}:cosmos_signDirect`, `${cosmoshub.id}:cosmos_signDirect`]);
});

test("targeting an unconfigured chain is invalid params", async () => {
  const { session } = recording();
  const provider = await Provider.create({ projectId: "x", metadata, chains: [cosmoshub] }, { session });

  await assert.rejects(
    () => provider.request({ method: "cosmos_signAmino" }, "cosmos:juno-1"),
    (e: unknown) => e instanceof ProviderRpcError && e.code === RpcErrorCode.invalidParams,
  );
});

test("a method the wallet declined is refused locally, naming what it did approve", async () => {
  const calls: string[] = [];
  const session = fakeSession(
    async (req) => {
      calls.push(req.method);
      return "ok";
    },
    {
      cosmos: {
        accounts: [`${cosmoshub.id}:${HUB}`],
        methods: ["cosmos_signDirect", "cosmos_signAmino"],
        events: [],
      },
    },
  );
  const provider = await Provider.create({ projectId: "x", metadata, chains: [cosmoshub] }, { session });

  await assert.rejects(
    () => provider.request({ method: "cosmos_getAccounts" }),
    (e: unknown) =>
      e instanceof ProviderRpcError &&
      e.code === RpcErrorCode.unsupportedMethod &&
      e.message.includes("cosmos_signAmino"),
  );
  await provider.request({ method: "cosmos_signAmino" });
  assert.deepEqual(calls, ["cosmos_signAmino"], "the declined method must never reach the wallet");
});

test("accountsByChain groups per-chain bech32 addresses", async () => {
  const { session } = recording();
  const provider = await Provider.create({ projectId: "x", metadata, chains: [cosmoshub, osmosis] }, { session });

  assert.deepEqual(provider.accountsByChain, {
    [cosmoshub.id]: [HUB],
    [osmosis.id]: [OSMO],
  });
});

test("a cosmos-only provider connects without an EIP-1193 chainId", async () => {
  const { session } = recording();
  const provider = await Provider.create({ projectId: "x", metadata, chains: [cosmoshub] }, { session });

  const connected = new Promise<ProviderEvents["connect"]>((resolve) => provider.once("connect", resolve));
  await provider.connect();
  assert.deepEqual(await connected, {});
  assert.equal("chainId" in provider, false);
});

test("cosmos and eip155 keep their own accessors in one session", async () => {
  const { calls, session } = recording({
    ...cosmosNamespaces,
    eip155: { accounts: ["eip155:1:0xabc"], methods: ["personal_sign"], events: [] },
  });
  const provider = await Provider.create(
    { projectId: "x", metadata, chains: [evm(1), cosmoshub, osmosis] },
    { session },
  );

  assert.equal(provider.chainId, 1);
  assert.deepEqual(provider.accounts, ["0xabc"]);
  assert.deepEqual(provider.accountsByChain["eip155:1"], ["0xabc"]);
  assert.deepEqual(provider.accountsByChain[osmosis.id], [OSMO]);

  await provider.request({ method: "personal_sign", params: ["0x", "0xabc"] });
  await provider.request({ method: "cosmos_signAmino" });
  assert.deepEqual(calls, ["eip155:1:personal_sign", `${cosmoshub.id}:cosmos_signAmino`]);
});
