import assert from "node:assert/strict";
import { test } from "node:test";
import { createPublicClient, createWalletClient, custom, parseEther, verifyMessage } from "viem";
import { hardhat } from "viem/chains";
import { startHardhat } from "./hardhat.ts";
import { connected, WC_PROJECT_ID } from "./helpers.ts";
import { ACCOUNT } from "./wallet.ts";

test("viem custom transport signs and sends against Hardhat", { skip: !WC_PROJECT_ID, timeout: 45_000 }, async (t) => {
  const hh = await startHardhat();
  t.after(() => hh.stop());
  const ctx = await connected(t, [31337], hh.url);
  const transport = custom(ctx.provider);
  const wallet = createWalletClient({ chain: hardhat, transport });
  const pub = createPublicClient({ chain: hardhat, transport });

  const [address] = await wallet.getAddresses();
  assert.ok(address);
  assert.equal(address.toLowerCase(), ACCOUNT.address.toLowerCase());

  const sig = await wallet.signMessage({ account: address, message: "konekt" });
  assert.equal(await verifyMessage({ address, message: "konekt", signature: sig }), true);

  const hash = await wallet.sendTransaction({
    account: address,
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    value: parseEther("0.01"),
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  assert.equal(receipt.status, "success");
});
