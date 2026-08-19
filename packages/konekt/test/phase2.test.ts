import assert from "node:assert/strict";
import { test } from "node:test";
import { type Hex, recoverMessageAddress } from "viem";
import { checkClaims, verifyCacao } from "../src/features/cacao.ts";
import { cacaosOf, siwe } from "../src/features/siwe.ts";
import { relays } from "../src/kernel/relay.ts";
import { connected, WC_PROJECT_ID } from "./helpers.ts";
import { ACCOUNT } from "./wallet.ts";

const skip = !WC_PROJECT_ID;
const msg = "0x68656c6c6f";

test("killing the socket reconnects and signing still works", { skip, timeout: 30_000 }, async (t) => {
  let opens = 0;
  const ctx = await connected(t, [1], undefined, {
    onDebug(e) {
      if (e.type === "socket_open") opens++;
    },
  });
  assert.ok(opens >= 1);
  relays.get(ctx.provider)!.drop();
  const start = Date.now();
  while (opens < 2 && Date.now() - start < 20_000) await new Promise((r) => setTimeout(r, 200));
  assert.ok(opens >= 2, "socket did not reopen");

  const sig = (await ctx.provider.request({
    method: "personal_sign",
    params: [msg, ACCOUNT.address],
  })) as Hex;
  assert.equal(
    (await recoverMessageAddress({ message: { raw: msg }, signature: sig })).toLowerCase(),
    ACCOUNT.address.toLowerCase(),
  );
});

test("wallet-initiated chain and account events surface as EIP-1193", { skip, timeout: 30_000 }, async (t) => {
  const ctx = await connected(t, [1]);
  const chain = new Promise<string>((resolve) => ctx.provider.once("chainChanged", resolve));
  const accounts = new Promise<string[]>((resolve) => ctx.provider.once("accountsChanged", resolve));
  await ctx.wallet.emit("chainChanged", "0xa");
  await ctx.wallet.emit("accountsChanged", ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"]);
  assert.equal(await chain, "0xa");
  assert.deepEqual(await accounts, ["0x70997970C51812dc3A010C7d01b50e0d17dc79C8"]);
  assert.equal(ctx.provider.chainId, 10, "a wallet-initiated switch must move the active chain, not just emit");
});

test("wallet disconnect surfaces as EIP-1193 disconnect", { skip, timeout: 30_000 }, async (t) => {
  const ctx = await connected(t, [1]);
  const gone = new Promise<{ code: number; message: string }>((resolve) => ctx.provider.once("disconnect", resolve));
  await ctx.wallet.disconnectSession();
  const ev = await gone;
  assert.equal(ev.code, 6000);
});

test("expired request rejects", { skip, timeout: 15_000 }, async (t) => {
  const ctx = await connected(t, [1], undefined, { ttl: { request: 1 }, delayMs: 4000 });
  await assert.rejects(
    () => ctx.provider.request({ method: "personal_sign", params: [msg, ACCOUNT.address] }),
    /request expired/,
  );
});

test("one-click auth settles a session and the CACAO verifies", { skip, timeout: 30_000 }, async (t) => {
  const feature = siwe({
    domain: "dapp.local",
    uri: "https://dapp.local/login",
    chains: ["eip155:1"],
    getNonce: () => "interop-nonce",
    statement: "Sign in to konekt.",
  });
  const ctx = await connected(t, [1], undefined, { features: [feature] });

  const cacaos = cacaosOf(ctx.provider.session);
  assert.equal(cacaos.length, 1, "the wallet must answer requests.authentication inside the settle");
  const [cacao] = cacaos;
  if (!cacao) throw new Error("no cacao");
  assert.equal(cacao.p.iss, `did:pkh:eip155:1:${ACCOUNT.address}`);
  assert.equal(cacao.p.nonce, "interop-nonce");
  // Formatted by the reference SDK on the wallet side, reconstructed by ours here.
  assert.deepEqual(await verifyCacao(cacao), { status: "valid" });
  assert.deepEqual(
    checkClaims(cacao.p, { domain: "dapp.local", nonce: "interop-nonce", uri: "https://dapp.local/login" }),
    { status: "valid" },
  );
});

test("request_sent fires after a session request", { skip, timeout: 30_000 }, async (t) => {
  const ctx = await connected(t, [1]);
  const sent = new Promise<{ id: number; topic: string; url: string | undefined }>((resolve) =>
    ctx.provider.once("request_sent", resolve),
  );
  await ctx.provider.request({ method: "personal_sign", params: [msg, ACCOUNT.address] });
  const e = await sent;
  assert.equal(e.topic, ctx.provider.session?.topic);
});
