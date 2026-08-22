---
title: Authentication features
description: Request Sign-In with Ethereum during pairing and verify the returned CACAO safely on your server.
---

Konekt can ask a wallet to authenticate while it approves the WalletConnect session. This is often called **one-click authentication** because connection and sign-in happen in one wallet flow.

The built-in `siwe()` feature follows Sign-In with Ethereum and CAIP-122. The wallet returns a signed **CACAO** (Chain Agnostic CApability Object) containing the account, domain, URI, nonce, and time limits.

Authentication has two separate jobs:

1. The browser asks the wallet to sign and binds the answer to the connected account.
2. The server verifies the signature and the claims before creating an authenticated app session.

The browser is not a trust boundary. Do not treat the presence of a CACAO as proof by itself.

## Request authentication in the browser

Add `siwe()` to the provider’s `features`:

```ts
import { Provider } from "konekt";
import { ethereumMainnet } from "konekt/eip155";
import { siwe, cacaosOf } from "konekt/siwe";

async function getNonce() {
  const response = await fetch("/auth/nonce", { credentials: "include" });
  if (!response.ok) throw new Error("Could not create a sign-in challenge");
  return response.text();
}

const provider = await Provider.init({
  projectId,
  metadata,
  chains: [ethereumMainnet],
  features: [
    siwe({
      domain: location.host,
      uri: location.origin,
      chains: ["eip155:1"],
      getNonce,
    }),
  ],
});

const session = await provider.connect();
const cacaos = cacaosOf(session);

const response = await fetch("/auth/verify", {
  method: "POST",
  headers: { "content-type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ cacaos }),
});

if (!response.ok) throw new Error("Sign-in failed");
```

`getNonce` runs immediately before each proposal is published, so it can fetch a fresh challenge from your server. The server should generate a cryptographically random nonce, associate it with the current browser session, and allow it to be used only once.

During settlement, Konekt checks that every returned CACAO:

- has the nonce, domain, and URI this provider requested;
- belongs to an account approved in the WalletConnect session.

If one of those checks fails, `connect()` rejects and Konekt tears down the new session. Signature verification still belongs on the server.

### SIWE options

| Option | Purpose |
| --- | --- |
| `domain` | The host shown to the wallet, usually `location.host`. |
| `uri` | The exact application URI, usually `location.origin`. |
| `chains` | CAIP-2 IDs the user may authenticate with, such as `["eip155:1"]`. |
| `getNonce` | Returns a fresh, server-issued nonce for each connection attempt. |
| `statement` | Optional human-readable reason for signing in. It cannot contain line breaks. |
| `exp` | Optional ISO timestamp after which the message is invalid. |
| `nbf` | Optional ISO timestamp before which the message is invalid. |
| `requestId` | Optional application-specific request identifier. |
| `resources` | Optional resource URIs covered by the sign-in message. |
| `required` | Whether connection must fail when the wallet does not answer the authentication request. Defaults to `true`. |

Not every wallet supports proposal authentication. If unauthenticated connections are useful in your app, set `required: false` and check the result explicitly:

```ts
const session = await provider.connect();
const cacaos = cacaosOf(session);

if (cacaos.length === 0) {
  // Connected, but not signed in.
}
```

Recap resources (`urn:recap:`) are not implemented. Passing a `urn:recap:` entry in `resources` makes `siwe()` throw immediately, and `verifyCacao()` reports `unverifiable` for a message that carries one, so neither side can silently ignore a capability it does not enforce.

## Verify authentication on the server

The server must validate both the signed message and the claims inside it:

- `verifyCacao()` checks the cryptographic signature.
- `checkClaims()` checks the domain and nonce, enforces the `exp` and `nbf` time limits, and compares the audience URI when you pass `uri`.

Neither check replaces the other. A valid signature over an old or attacker-issued nonce is not a valid login.

Both functions return `valid`, `invalid`, or `unverifiable`:

| Status | Meaning | Authentication decision |
| --- | --- | --- |
| `valid` | The check passed. | Continue only after both checks are valid. |
| `invalid` | The signature or a claim is wrong. | Reject authentication. |
| `unverifiable` | This process could not complete the check, for example because smart-account RPC is unavailable. | Do not authenticate; retry or report a temporary failure. |

`unverifiable` does not prove forgery, but it is never safe to treat it as success.

A wallet returns one CACAO per authenticated account, so the browser posts an array. Verify each one, then consume the nonce once for the whole request:

```ts
import type { Cacao } from "konekt";
import { checkClaims, verifyCacao } from "konekt/cacao";
import { http } from "konekt/http";

declare function loadIssuedNonce(browserSessionId: string): Promise<string>;
declare function consumeIssuedNonce(browserSessionId: string, nonce: string): Promise<boolean>;

const call = http("https://ethereum.example-rpc.com");

async function verifyOne(cacao: Cacao, nonce: string): Promise<string> {
  const claims = checkClaims(cacao.p, {
    domain: "app.example.com",
    uri: "https://app.example.com",
    nonce,
  });
  if (claims.status !== "valid") throw new Error(claims.reason);

  const signature = await verifyCacao(cacao, { call });
  if (signature.status !== "valid") throw new Error(signature.reason);

  return cacao.p.iss;
}

async function authenticate(cacaos: Cacao[], browserSessionId: string) {
  if (cacaos.length === 0) throw new Error("The wallet did not authenticate");

  const nonce = await loadIssuedNonce(browserSessionId);
  const issuers: string[] = [];
  for (const cacao of cacaos) {
    issuers.push(await verifyOne(cacao, nonce));
  }

  // Make this an atomic compare-and-delete. Only one request may succeed.
  if (!(await consumeIssuedNonce(browserSessionId, nonce))) {
    throw new Error("This sign-in challenge was already used");
  }

  return issuers;
}
```

Each issuer is a `did:pkh` string such as `did:pkh:eip155:1:0x…`. Use `parseDidPkh()` from `konekt/cacao` to read its namespace, reference, and address. The wallet lists the account it considers primary first; sign the user in as that account and treat the rest as additional proven addresses.

The `call` option is needed for EIP-1271 smart contract accounts. It must reach JSON-RPC for the issuer’s chain. Ordinary EIP-191 account signatures can be checked without it.

Consume the nonce once per request, as above. Consuming it inside the loop makes every CACAO after the first fail.

## Write a custom feature

A feature is a plain object passed in `features`. It owns one key under `Proposal.requests` and reads the wallet’s answer back from the matching key of `Session.proposalRequestsResponses`. Konekt carries both containers without interpreting them, so a new feature is not a change to the provider.

```ts
import type { Feature } from "konekt";

export function greeting(text: string): Feature {
  let sent: string | undefined;

  return {
    name: "greeting",

    async onProposal(proposal) {
      sent = text;
      return { ...proposal, requests: { ...proposal.requests, greeting: { text } } };
    },

    onSettle(session) {
      const answer = session.proposalRequestsResponses?.greeting;
      if (sent && !answer) throw new Error("The wallet ignored the greeting request");
    },

    onDisconnect() {
      sent = undefined;
    },
  };
}
```

The contract in full:

- `name` is required. Konekt uses it in diagnostics.
- `onProposal` is awaited before the proposal is published, so it may fetch a server challenge. Return the proposal you want published; returning nothing keeps the current one.
- `onSettle` runs after the wallet approves. Throwing rejects `connect()` and disconnects the session Konekt just settled, so it never leaves a half-authenticated session behind.
- `onDisconnect` clears feature-owned state.

Features participate in connection setup. They do not wrap or intercept `provider.request()`.
