import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryStorage, ProviderRpcError, RpcErrorCode } from "../src/index.ts";
import { connected, freshProvider, WC_PROJECT_ID } from "./helpers.ts";

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
