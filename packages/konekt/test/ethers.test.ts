import assert from "node:assert/strict";
import { test } from "node:test";
import { BrowserProvider, parseEther, verifyMessage } from "ethers";
import { startHardhat } from "./hardhat.ts";
import { connected, WC_PROJECT_ID } from "./helpers.ts";
import { ACCOUNT } from "./wallet.ts";

test("ethers BrowserProvider signs and sends against Hardhat", { skip: !WC_PROJECT_ID, timeout: 45_000 }, async (t) => {
  const hh = await startHardhat();
  t.after(() => hh.stop());
  const ctx = await connected(t, [31337], hh.url);
  const ethersProvider = new BrowserProvider(ctx.provider, 31337);
  const signer = await ethersProvider.getSigner();

  const address = await signer.getAddress();
  assert.equal(address.toLowerCase(), ACCOUNT.address.toLowerCase());

  const signature = await signer.signMessage("konekt");
  assert.equal(verifyMessage("konekt", signature).toLowerCase(), address.toLowerCase());

  const tx = await signer.sendTransaction({
    to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    value: parseEther("0.01"),
  });
  const receipt = await tx.wait();
  assert.equal(receipt?.status, 1);
});
