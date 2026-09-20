import assert from "node:assert/strict";
import { test } from "node:test";
import { evm } from "../src/chains/eip155.ts";
import { decrypt, deriveSymKey, encrypt, generateX25519, hashKey } from "../src/kernel/crypto.ts";
import { Provider } from "../src/kernel/provider.ts";
import { SessionClient } from "../src/kernel/session.ts";
import { parseUri } from "../src/kernel/uri.ts";
import { FakeRelay, paired } from "./fake-relay.ts";
import { METADATA } from "./helpers.ts";

const ADDRESS = "0x0000000000000000000000000000000000000001";

test("Provider construction stays synchronous and does not connect", () => {
  const relay = new FakeRelay();
  const provider = new Provider(
    { projectId: "project", metadata: METADATA, chains: [evm(1)] },
    { relay, seed: new Uint8Array(32) },
  );
  assert.equal(provider.connected, false);
  assert.equal(relay.connects, 0);
});

test("proposal response derives the key before a back-to-back settlement", async () => {
  const relay = new FakeRelay();
  let uri: string | undefined;
  const client = new SessionClient({
    relay,
    metadata: METADATA,
    namespaces: { eip155: { chains: ["eip155:1"], methods: [], events: [] } },
    onUri(next) {
      uri = next;
    },
  });

  relay.onProposal = async (pairingTopic, encryptedProposal) => {
    if (!uri) throw new Error("pairing URI was not emitted");
    const pairing = parseUri(uri);
    const proposal = JSON.parse(await decrypt(pairing.symKey, encryptedProposal)) as {
      id: number;
      params: { proposer: { publicKey: string } };
    };
    const wallet = await generateX25519();
    const sessionSym = await deriveSymKey(wallet.privateKey, proposal.params.proposer.publicKey);
    const sessionTopic = await hashKey(sessionSym);
    const response = {
      id: proposal.id,
      jsonrpc: "2.0",
      result: { relay: { protocol: "irn" }, responderPublicKey: wallet.publicKey },
    };
    const settle = {
      id: proposal.id + 1,
      jsonrpc: "2.0",
      method: "wc_sessionSettle",
      params: {
        relay: { protocol: "irn" },
        namespaces: {
          eip155: {
            accounts: [`eip155:1:${ADDRESS}`],
            methods: [],
            events: [],
          },
        },
        expiry: 1_900_000_000,
        controller: { publicKey: wallet.publicKey, metadata: METADATA },
      },
    };

    relay.emit(pairingTopic, await encrypt(pairing.symKey, JSON.stringify(response)));
    relay.emit(sessionTopic, await encrypt(sessionSym, JSON.stringify(settle)));
  };

  const session = await client.connect();
  assert.equal(session.namespaces.eip155?.accounts?.length, 1);
  await client.disconnect();
});

test("a wallet chainChanged for an unconfigured chain surfaces without moving the active chain", async () => {
  const { provider, wallet } = await paired({
    chains: [evm(1)],
    namespaces: { eip155: { accounts: [`eip155:1:${ADDRESS}`, `eip155:10:${ADDRESS}`], methods: [], events: [] } },
  });
  assert.equal(provider.chainId, 1);

  const changed = new Promise<string>((resolve) => provider.once("chainChanged", resolve));
  await wallet.emit("chainChanged", "0xa", "eip155:10");

  assert.equal(await changed, "0xa", "the app must still see the wallet's chain, to show a wrong-network state");
  assert.equal(provider.chainId, 1);
  assert.equal(await provider.request({ method: "eth_chainId" }), "0x1");
});

test("a wallet chainChanged for a configured chain moves the active chain", async () => {
  const { provider, wallet } = await paired({
    chains: [evm(1), evm(10)],
    namespaces: { eip155: { accounts: [`eip155:1:${ADDRESS}`, `eip155:10:${ADDRESS}`], methods: [], events: [] } },
  });
  assert.equal(provider.chainId, 1);

  const changed = new Promise<string>((resolve) => provider.once("chainChanged", resolve));
  await wallet.emit("chainChanged", "0xa", "eip155:10");

  assert.equal(await changed, "0xa");
  assert.equal(provider.chainId, 10);
});
