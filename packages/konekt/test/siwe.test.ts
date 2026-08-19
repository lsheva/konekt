import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMessage } from "@walletconnect/utils";
import { privateKeyToAccount } from "viem/accounts";
import { checkClaims, formatCacaoMessage, verifyCacao } from "../src/features/cacao.ts";
import { cacaosOf, siwe } from "../src/features/siwe.ts";
import { Provider } from "../src/index.ts";
import { applyProposal, type Proposal } from "../src/kernel/plugin.ts";
import type { Cacao, CacaoPayload, Session } from "../src/kernel/types.ts";
import { ACCOUNT } from "./wallet.ts";

const metadata = { name: "t", description: "", url: "https://t.local", icons: [] };
const DOMAIN = "dapp.local";
const URI = "https://dapp.local/login";
const ISS = `did:pkh:eip155:1:${ACCOUNT.address}`;

function payload(extra: Partial<CacaoPayload> = {}): CacaoPayload {
  return {
    iss: ISS,
    domain: DOMAIN,
    aud: URI,
    version: "1",
    nonce: "abc123",
    iat: "2026-08-19T17:00:00.000Z",
    ...extra,
  };
}

async function sign(p: CacaoPayload): Promise<Cacao> {
  const account = privateKeyToAccount(ACCOUNT.key);
  const s = await account.signMessage({ message: formatCacaoMessage(p) });
  return { h: { t: "caip122" }, p, s: { t: "eip191", s } };
}

// The whole scheme rests on reconstructing the exact bytes the wallet hashed. A single
// character of drift from the reference formatter makes every signature look forged.
test("formatCacaoMessage is byte-identical to @walletconnect/utils", () => {
  const cases: Record<string, CacaoPayload> = {
    minimal: payload(),
    statement: payload({ statement: "Sign in to the showcase." }),
    expiry: payload({ exp: "2026-08-19T18:00:00.000Z", nbf: "2026-08-19T16:00:00.000Z" }),
    requestId: payload({ requestId: "42" }),
    resources: payload({ resources: ["https://dapp.local/tos", "ipfs://bafy"] }),
    everything: payload({
      statement: "Sign in to the showcase.",
      exp: "2026-08-19T18:00:00.000Z",
      nbf: "2026-08-19T16:00:00.000Z",
      requestId: "42",
      resources: ["https://dapp.local/tos"],
    }),
    solana: payload({ iss: "did:pkh:solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ:9xQe" }),
    bitcoin: payload({ iss: "did:pkh:bip122:000000000019d6689c085ae165831e93:bc1q" }),
    unknownNamespace: payload({ iss: "did:pkh:cosmos:cosmoshub-4:cosmos1abc" }),
    uriInsteadOfAud: {
      iss: ISS,
      domain: DOMAIN,
      uri: URI,
      version: "1",
      nonce: "abc123",
      iat: "2026-08-19T17:00:00.000Z",
    },
  };
  for (const [name, p] of Object.entries(cases)) {
    assert.equal(formatCacaoMessage(p), formatMessage(p, p.iss), `${name} must match the reference byte for byte`);
  }
});

test("a statement with a line break is refused so it cannot forge the lines below it", () => {
  assert.throws(() => formatCacaoMessage(payload({ statement: "ok\nURI: https://evil.local" })), /line breaks/);
});

test("a real signature verifies and a tampered one does not", async () => {
  const cacao = await sign(payload({ statement: "Sign in to the showcase." }));
  assert.deepEqual(await verifyCacao(cacao), { status: "valid" });

  const flipped = cacao.s.s.slice(0, -2) + (cacao.s.s.endsWith("00") ? "01" : "00");
  const tampered: Cacao = { ...cacao, s: { ...cacao.s, s: flipped } };
  assert.equal((await verifyCacao(tampered)).status, "invalid", "a tampered signature must be rejected");
});

test("mutating the signed payload invalidates the signature", async () => {
  const cacao = await sign(payload({ statement: "Sign in to the showcase." }));
  const moved: Cacao = { ...cacao, p: { ...cacao.p, statement: "Send me all your money." } };
  assert.equal((await verifyCacao(moved)).status, "invalid");

  const reissued: Cacao = { ...cacao, p: { ...cacao.p, nonce: "different" } };
  assert.equal((await verifyCacao(reissued)).status, "invalid");
});

test("what cannot be checked is unverifiable, not invalid", async () => {
  const recap = await sign(payload());
  const withRecap: Cacao = { ...recap, p: { ...recap.p, resources: ["urn:recap:eyJhdHQiOnt9fQ"] } };
  assert.equal((await verifyCacao(withRecap)).status, "unverifiable", "recaps rewrite the statement");

  const solana: Cacao = { ...recap, s: { t: "ed25519", s: "0xdead" } };
  assert.equal((await verifyCacao(solana)).status, "unverifiable", "no verifier is defined for non-EVM signatures");

  const contract: Cacao = { ...recap, s: { t: "eip1271", s: "0xdead" } };
  assert.equal((await verifyCacao(contract)).status, "unverifiable", "eip1271 needs an RPC and none was given");
});

test("eip1271 asks the account contract and believes the magic value", async () => {
  const cacao: Cacao = { h: { t: "caip122" }, p: payload(), s: { t: "eip1271", s: "0xbeef" } };
  const calls: unknown[] = [];
  const accept = async (req: { method: string; params?: unknown }) => {
    calls.push(req.params);
    return `0x${"1626ba7e"}${"0".repeat(56)}`;
  };
  assert.deepEqual(await verifyCacao(cacao, { call: accept }), { status: "valid" });
  assert.equal(calls.length, 1);

  const reject = async () => `0x${"0".repeat(64)}`;
  assert.equal((await verifyCacao(cacao, { call: reject })).status, "invalid");

  const down = async () => {
    throw new Error("rpc down");
  };
  assert.equal((await verifyCacao(cacao, { call: down })).status, "unverifiable", "an outage is not a forgery");
});

test("checkClaims catches the replays a signature check cannot", () => {
  const now = new Date("2026-08-19T17:30:00.000Z");
  const expected = { domain: DOMAIN, nonce: "abc123", uri: URI, now };
  assert.deepEqual(checkClaims(payload(), expected), { status: "valid" });
  assert.equal(checkClaims(payload({ domain: "evil.local" }), expected).status, "invalid");
  assert.equal(checkClaims(payload({ nonce: "replayed" }), expected).status, "invalid");
  assert.equal(checkClaims(payload({ aud: "https://evil.local" }), expected).status, "invalid");
  assert.equal(checkClaims(payload({ exp: "2026-08-19T17:00:00.000Z" }), expected).status, "invalid");
  assert.equal(checkClaims(payload({ nbf: "2026-08-19T18:00:00.000Z" }), expected).status, "invalid");
});

const baseProposal: Proposal = {
  requiredNamespaces: {},
  optionalNamespaces: { eip155: { chains: ["eip155:1"], methods: [], events: [] } },
  relays: [{ protocol: "irn" }],
  proposer: { publicKey: "pub", metadata },
  expiryTimestamp: 0,
};

function options(extra: Partial<Parameters<typeof siwe>[0]> = {}) {
  return { domain: DOMAIN, uri: URI, chains: ["eip155:1"], getNonce: () => "abc123", ...extra };
}

test("onProposal awaits the nonce and attaches the authentication request", async () => {
  const feature = siwe(options({ getNonce: async () => "from-the-server", statement: "Sign in." }));
  const out = await applyProposal([feature], baseProposal);
  const authentication = out.requests?.authentication;
  assert.ok(Array.isArray(authentication), "requests.authentication must be an array");
  assert.equal(authentication.length, 1, "one entry per authentication request");
  const request: Record<string, unknown> = authentication[0];
  assert.equal(request.nonce, "from-the-server", "an async nonce must reach the wire");
  assert.equal(request.aud, URI, "the caller's uri travels as aud");
  assert.equal(request.domain, DOMAIN);
  assert.equal(request.type, "caip122");
  assert.equal(request.version, "1");
  assert.deepEqual(request.chains, ["eip155:1"]);
  assert.equal(request.statement, "Sign in.");
  assert.ok(typeof request.iat === "string" && !Number.isNaN(Date.parse(request.iat)));
  assert.deepEqual(baseProposal.requests, undefined, "the incoming proposal must not be mutated");
});

test("siwe refuses recap resources instead of signing something it cannot reconstruct", () => {
  assert.throws(() => siwe(options({ resources: ["urn:recap:eyJhdHQiOnt9fQ"] })), /recap/i);
});

function fakeSession(session: Session) {
  let disconnected = false;
  return {
    handle: {
      uri: undefined as string | undefined,
      get session() {
        return disconnected ? undefined : session;
      },
      connect: async () => session,
      restore: async () => false,
      request: async () => undefined,
      disconnect: async () => {
        disconnected = true;
      },
    },
    wasDisconnected: () => disconnected,
  };
}

function settled(cacaos: Cacao[], accounts = [`eip155:1:${ACCOUNT.address}`]): Session {
  return {
    topic: "topic",
    pairingTopic: "pairing",
    relay: { protocol: "irn" },
    expiry: 0,
    namespaces: { eip155: { accounts, methods: [], events: [] } },
    controller: "controller",
    self: { publicKey: "self", metadata },
    peer: { publicKey: "peer", metadata },
    proposalRequestsResponses: { authentication: cacaos },
  };
}

async function connectWith(session: Session, extra: Partial<Parameters<typeof siwe>[0]> = {}) {
  const feature = siwe(options(extra));
  await applyProposal([feature], baseProposal);
  const fake = fakeSession(session);
  const provider = await Provider.create(
    {
      projectId: "x",
      metadata,
      chains: [{ namespace: "eip155", id: "eip155:1", adapter: stubAdapter }],
      features: [feature],
    },
    { session: fake.handle },
  );
  return { provider, fake };
}

const stubAdapter = { namespace: "eip155", methods: [], events: [] };

test("a settled session carries the CACAOs through to the app", async () => {
  const cacao = await sign(payload());
  const { provider } = await connectWith(settled([cacao]));
  await provider.connect();
  assert.equal(cacaosOf(provider.session).length, 1);
  assert.equal(cacaosOf(provider.session)[0]?.p.iss, ISS, "the kernel must not drop proposalRequestsResponses");
});

test("a CACAO signed by an account the session never granted rejects the connection", async () => {
  const cacao = await sign(payload());
  const { provider, fake } = await connectWith(
    settled([cacao], ["eip155:1:0x000000000000000000000000000000000000dEaD"]),
  );
  await assert.rejects(provider.connect(), /does not grant/);
  assert.ok(fake.wasDisconnected(), "a rejected connect must not leave a live session behind");
});

test("a CACAO echoing a nonce this app never issued rejects the connection", async () => {
  const cacao = await sign(payload({ nonce: "not-ours" }));
  const { provider } = await connectWith(settled([cacao]));
  await assert.rejects(provider.connect(), /nonce/);
});

test("a wallet that ignores the request fails loudly unless the app opts out", async () => {
  const silent = settled([]);
  const strict = await connectWith(silent);
  await assert.rejects(strict.provider.connect(), /without answering the authentication request/);

  const lenient = await connectWith(silent, { required: false });
  await lenient.provider.connect();
  assert.deepEqual(cacaosOf(lenient.provider.session), []);
});
