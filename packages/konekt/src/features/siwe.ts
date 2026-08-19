import type { Feature } from "../kernel/plugin.ts";
import { type Cacao, parseCaipAccount, type Session } from "../kernel/types.ts";

/**
 * Sign-In with Ethereum folded into the session proposal, so the wallet prompts once instead of
 * twice. This half only asks and binds. It never judges a signature: the browser is not a trust
 * boundary, so verification belongs to whoever consumes the CACAO. See `konekt/cacao`.
 */

const DID_PKH = "did:pkh:";

/** Configuration for {@link siwe} proposal authentication. */
export type SiweOptions = {
  /** Site asking the user to sign in, exactly as the wallet should display it. Usually `location.host`. */
  domain: string;
  /** Application audience URI. Usually `location.origin`. */
  uri: string;
  /** CAIP-2 chain IDs to authenticate. The wallet returns one CACAO per account it signs for. */
  chains: string[];
  /**
   * Returns a fresh, single-use challenge. This is awaited for every connection attempt so the
   * nonce can be issued by the server immediately before pairing.
   */
  getNonce: () => string | Promise<string>;
  /** Optional human-readable reason for signing in. Keep it to one line. */
  statement?: string | undefined;
  /** Optional ISO timestamp after which the authentication message is expired. */
  exp?: string | undefined;
  /** Optional ISO timestamp before which the authentication message is not valid. */
  nbf?: string | undefined;
  /** Optional application-specific identifier included in the signed message. */
  requestId?: string | undefined;
  /** Optional resource URIs included in the signed message. `urn:recap:` resources are unsupported. */
  resources?: string[] | undefined;
  /**
   * Whether a wallet must answer the authentication request. Defaults to `true`.
   *
   * When `true`, a wallet that ignores authentication causes `connect()` to reject. Set this to
   * `false` to allow a connected but signed-out session, then use `cacaosOf(session).length` to
   * distinguish that state.
   */
  required?: boolean | undefined;
};

/** `requests.authentication[]` on the wire. The caller's `uri` travels as `aud`. */
type AuthenticationRequest = {
  domain: string;
  chains: string[];
  nonce: string;
  type: string;
  aud: string;
  version: string;
  iat: string;
  statement?: string | undefined;
  exp?: string | undefined;
  nbf?: string | undefined;
  requestId?: string | undefined;
  resources?: string[] | undefined;
};

/**
 * Reads the CACAOs returned for this session's authentication request.
 *
 * @returns The response array, or an empty array when the session is absent or the wallet did not
 * answer authentication.
 */
export function cacaosOf(session: Session | undefined): Cacao[] {
  const authentication = session?.proposalRequestsResponses?.authentication;
  return Array.isArray(authentication) ? authentication : [];
}

function accountOf(iss: string) {
  return iss.startsWith(DID_PKH) ? parseCaipAccount(iss.slice(DID_PKH.length)) : undefined;
}

function approvedAccounts(session: Session): Set<string> {
  const out = new Set<string>();
  for (const namespace of Object.values(session.namespaces)) {
    for (const account of namespace.accounts ?? []) out.add(account.toLowerCase());
  }
  return out;
}

/**
 * Adds a CAIP-122 authentication request to the WalletConnect session proposal.
 *
 * The feature fetches a nonce in `onProposal`. After approval it checks that returned CACAOs match
 * that nonce, the requested domain and URI, and an account granted by the session. It does not
 * verify signatures.
 *
 * Send the returned CACAOs to the server that makes the authentication decision. That server must
 * call both `verifyCacao()` and `checkClaims()` from `konekt/cacao`.
 *
 * @example
 * ```ts
 * features: [
 *   siwe({
 *     domain: location.host,
 *     uri: location.origin,
 *     chains: ["eip155:1"],
 *     getNonce: () => fetch("/auth/nonce").then((response) => response.text()),
 *   }),
 * ]
 * ```
 *
 * @throws When `resources` contains an unsupported `urn:recap:` entry.
 */
export function siwe(options: SiweOptions): Feature {
  if (options.resources?.some((r) => r.startsWith("urn:recap:"))) {
    throw new Error("siwe does not support recap resources: the statement rewrite they require is not implemented.");
  }
  // Carried from the proposal to the settle so the echo can be checked. One instance, one provider.
  let issuedNonce: string | undefined;

  return {
    name: "siwe",

    async onProposal(proposal) {
      const nonce = await options.getNonce();
      issuedNonce = nonce;
      const request: AuthenticationRequest = {
        domain: options.domain,
        chains: options.chains,
        nonce,
        type: "caip122",
        aud: options.uri,
        version: "1",
        iat: new Date().toISOString(),
        statement: options.statement,
        exp: options.exp,
        nbf: options.nbf,
        requestId: options.requestId,
        resources: options.resources,
      };
      return { ...proposal, requests: { ...proposal.requests, authentication: [request] } };
    },

    onSettle(session) {
      const cacaos = cacaosOf(session);
      if (!cacaos.length) {
        if (options.required === false) return;
        throw new Error(
          "The wallet settled a session without answering the authentication request. " +
            "Pass required: false to allow an unauthenticated session.",
        );
      }
      const accounts = approvedAccounts(session);
      for (const { p } of cacaos) {
        if (p.nonce !== issuedNonce) throw new Error("A returned CACAO carries a nonce this app never issued.");
        if (p.domain !== options.domain) {
          throw new Error(`A returned CACAO is for domain "${p.domain}", not "${options.domain}".`);
        }
        const target = p.aud ?? p.uri;
        if (target !== options.uri) throw new Error(`A returned CACAO is for URI "${target}", not "${options.uri}".`);
        const account = accountOf(p.iss);
        if (!account) throw new Error(`A returned CACAO has a malformed issuer "${p.iss}".`);
        // Signed by an account the session never granted: authenticated as one address, transacting as another.
        if (!accounts.has(`${account.chainId}:${account.address}`.toLowerCase())) {
          throw new Error(`A returned CACAO is signed by ${p.iss}, which the session does not grant.`);
        }
      }
    },

    onDisconnect() {
      issuedNonce = undefined;
    },
  };
}
