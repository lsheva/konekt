import assert from "node:assert/strict";
import { test } from "node:test";
import { type Hex, recoverMessageAddress } from "viem";
import { connected, WC_PROJECT_ID } from "./helpers.ts";
import { ACCOUNT } from "./wallet.ts";

test("handshake + eth_accounts + personal_sign + eth_sendTransaction", {
  skip: !WC_PROJECT_ID,
  timeout: 30_000,
}, async (t) => {
  const ctx = await connected(t, [1]);

  assert.equal(ctx.provider.connected, true);
  assert.ok(ctx.provider.session);
  assert.equal(ctx.provider.accounts[0]?.toLowerCase(), ACCOUNT.address.toLowerCase());

  const accounts = (await ctx.provider.request({ method: "eth_accounts" })) as string[];
  assert.deepEqual(accounts, ctx.provider.accounts);

  const msg = "0x68656c6c6f";
  const sig = (await ctx.provider.request({
    method: "personal_sign",
    params: [msg, ACCOUNT.address],
  })) as Hex;
  assert.equal(
    (await recoverMessageAddress({ message: { raw: msg as Hex }, signature: sig })).toLowerCase(),
    ACCOUNT.address.toLowerCase(),
  );

  const hash = (await ctx.provider.request({
    method: "eth_sendTransaction",
    params: [{ from: ACCOUNT.address, to: ACCOUNT.address, value: "0x0" }],
  })) as string;
  assert.match(hash, /^0x[0-9a-fA-F]{64}$/);
});
