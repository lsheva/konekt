# Security policy

Konekt handles wallet connections and relays signing requests. A defect here can cost users money,
so please report suspected vulnerabilities privately rather than in a public issue.

## Reporting a vulnerability

Use GitHub's private reporting form:
[Report a vulnerability](https://github.com/lsheva/konekt/security/advisories/new).

Include the affected version, what an attacker gains, and a reproduction if you have one. You will
get an acknowledgement within a few days. Once a fix is released, we will credit you in the advisory
unless you prefer otherwise.

Please do not open a public issue, pull request, or discussion describing an unfixed vulnerability.

## Supported versions

Konekt is pre-1.0. Fixes go to the latest published minor of `konekt` and `konekt-ui`; older
versions do not receive backports.

## Scope

In scope:

- Session or pairing key handling, encryption, and the relay protocol implementation.
- CACAO signature or claim verification producing `valid` for something that is not.
- A request reaching a chain, account, or method the user did not approve.
- Leaking a pairing URI, session key, or relay seed to code that should not see it.

Out of scope, though still worth reporting as ordinary issues:

- Wallet-side behavior. Konekt cannot constrain what an approved wallet does.
- Relay availability, and the security of the public WalletConnect relay itself.
- Attacks requiring an already-compromised browser, extension, or origin.

## Security model

Two boundaries matter when assessing a report.

**The browser is not a trust boundary.** `konekt/siwe` asks a wallet to authenticate and binds the
answer to the session. It does not prove anything to your server. Authentication decisions belong to
server code calling both `verifyCacao()` and `checkClaims()` from `konekt/cacao` with a single-use,
server-issued nonce. A signature check without domain, URI, nonce, and time checks is incomplete, and
`unverifiable` is never a success.

**Stored session material is a credential.** `konekt:seed`, `konekt:keys`, and `konekt:session` in `localStorage` let their holder act as your app for the life of the session. Keep them out of logs
and error reports. The same is true of the pairing URI, which is a short-lived connection secret.

Konekt requires a secure context. Web Crypto is unavailable over plain HTTP, and the provider fails
rather than falling back to weaker cryptography.
