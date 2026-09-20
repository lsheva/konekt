import assert from "node:assert/strict";
import { test } from "node:test";
import { evm } from "../src/chains/eip155.ts";
import { memoryStorage, Provider, ProviderRpcError, RpcErrorCode } from "../src/index.ts";
import { FakeRelay, paired } from "./fake-relay.ts";
import { connected, freshProvider, METADATA, WC_PROJECT_ID } from "./helpers.ts";

test("page reload restores the session", { skip: !WC_PROJECT_ID, timeout: 30_000 }, async (t) => {
  const storage = memoryStorage();
  const ctx = await connected(t, [1], undefined, { storage });
  assert.equal(ctx.provider.connected, true);
  const accounts = ctx.provider.accounts;

  const reloaded = await freshProvider({ storage });
  t.after(() => reloaded.disconnect().catch(() => {}));
  assert.equal(reloaded.connected, true);
  assert.ok(reloaded.session);
  assert.deepEqual(await reloaded.request({ method: "eth_accounts" }), accounts);
});

test("a session update that drops the active chain re-derives what a reload would compute", async () => {
  const storage = memoryStorage();
  const address = "0x0000000000000000000000000000000000000001";
  const { provider, wallet } = await paired({
    chains: [evm(1), evm(8453)],
    namespaces: { eip155: { accounts: [`eip155:1:${address}`, `eip155:8453:${address}`], methods: [], events: [] } },
    storage,
  });
  assert.equal(provider.chainId, 1);

  const changed = new Promise<string>((resolve) => provider.once("chainChanged", resolve));
  await wallet.update({ eip155: { accounts: [`eip155:8453:${address}`], methods: [], events: [] } });
  assert.equal(await changed, "0x2105");
  assert.equal(provider.chainId, 8453);

  await new Promise((resolve) => setTimeout(resolve, 0));
  const reloaded = await Provider.create(
    { projectId: "test", metadata: METADATA, chains: [evm(1), evm(8453)], storage },
    { relay: new FakeRelay(), seed: new Uint8Array(32) },
  );
  assert.equal(reloaded.chainId, provider.chainId);
});

test("storage: null loses the session on reload", { skip: !WC_PROJECT_ID, timeout: 30_000 }, async (t) => {
  const ctx = await connected(t, [1], undefined, { storage: null });
  assert.equal(ctx.provider.connected, true);

  const reloaded = await freshProvider({ storage: null });
  assert.equal(reloaded.connected, false);
  await assert.rejects(
    () => reloaded.request({ method: "eth_accounts" }),
    (e: unknown) => {
      assert.ok(e instanceof ProviderRpcError);
      assert.equal(e.code, RpcErrorCode.unauthorized);
      return true;
    },
  );
});
