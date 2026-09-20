import { decrypt, deriveSymKey, encrypt, generateX25519, hashKey } from "../src/kernel/crypto.ts";
import type { ChainExtensions, ChainInput } from "../src/kernel/plugin.ts";
import { Provider } from "../src/kernel/provider.ts";
import type { Relay } from "../src/kernel/session.ts";
import type { Storage } from "../src/kernel/storage.ts";
import type { Session } from "../src/kernel/types.ts";
import { parseUri } from "../src/kernel/uri.ts";
import { METADATA } from "./helpers.ts";

export class FakeRelay implements Relay {
  #onMessage: ((topic: string, message: string) => void) | undefined;
  onProposal: ((topic: string, message: string) => Promise<void>) | undefined;
  connects = 0;

  async connect() {
    this.connects++;
  }
  async close() {}
  async subscribe(_topic: string) {}
  async publish(_topic: string, _message: string, _opts: { ttl: number; tag: number; prompt?: boolean }) {}
  async proposeSession(topic: string, message: string) {
    const onProposal = this.onProposal;
    if (onProposal) queueMicrotask(() => void onProposal(topic, message));
  }
  onMessage(fn: (topic: string, message: string) => void) {
    this.#onMessage = fn;
  }
  emit(topic: string, message: string) {
    this.#onMessage?.(topic, message);
  }
}

/** The wallet half of a settled session: it answers the proposal, then drives session messages. */
export type FakeWallet = {
  /** Sends `wc_sessionEvent`, as a wallet does for `chainChanged` and `accountsChanged`. */
  emit: (name: string, data: unknown, chainId?: string) => Promise<void>;
  /** Sends `wc_sessionUpdate` with replacement namespaces. */
  update: (namespaces: Session["namespaces"]) => Promise<void>;
};

/**
 * Connects a provider to a scripted wallet without a socket.
 *
 * The wallet approves exactly the namespaces it is given, including chains the provider never
 * proposed, which is what a real wallet is free to do.
 */
export async function paired<const C extends readonly ChainInput[]>(opts: {
  chains: C;
  namespaces: Session["namespaces"];
  storage?: Storage | undefined;
}): Promise<{ provider: Provider & ChainExtensions<C>; wallet: FakeWallet; relay: FakeRelay }> {
  const relay = new FakeRelay();
  let provider: Provider | undefined;
  let sessionSym: string | undefined;
  let sessionTopic: string | undefined;
  let id = 1;

  relay.onProposal = async (pairingTopic, encryptedProposal) => {
    const uri = provider?.uri;
    if (!uri) throw new Error("pairing URI was not emitted");
    const pairing = parseUri(uri);
    const proposal = JSON.parse(await decrypt(pairing.symKey, encryptedProposal)) as {
      id: number;
      params: { proposer: { publicKey: string } };
    };
    const self = await generateX25519();
    sessionSym = await deriveSymKey(self.privateKey, proposal.params.proposer.publicKey);
    sessionTopic = await hashKey(sessionSym);
    id = proposal.id + 1;
    const response = {
      id: proposal.id,
      jsonrpc: "2.0",
      result: { relay: { protocol: "irn" }, responderPublicKey: self.publicKey },
    };
    const settle = {
      id,
      jsonrpc: "2.0",
      method: "wc_sessionSettle",
      params: {
        relay: { protocol: "irn" },
        namespaces: opts.namespaces,
        expiry: 1_900_000_000,
        controller: { publicKey: self.publicKey, metadata: METADATA },
      },
    };
    relay.emit(pairingTopic, await encrypt(pairing.symKey, JSON.stringify(response)));
    relay.emit(sessionTopic, await encrypt(sessionSym, JSON.stringify(settle)));
  };

  const created = await Provider.create(
    { projectId: "test", metadata: METADATA, chains: opts.chains, storage: opts.storage },
    { relay, seed: new Uint8Array(32) },
  );
  provider = created;
  await created.connect();

  const send = async (payload: object) => {
    if (!sessionSym || !sessionTopic) throw new Error("no session");
    relay.emit(sessionTopic, await encrypt(sessionSym, JSON.stringify(payload)));
  };

  return {
    provider: created,
    relay,
    wallet: {
      emit: (name, data, chainId) =>
        send({ id: ++id, jsonrpc: "2.0", method: "wc_sessionEvent", params: { event: { name, data }, chainId } }),
      update: (namespaces) => send({ id: ++id, jsonrpc: "2.0", method: "wc_sessionUpdate", params: { namespaces } }),
    },
  };
}
