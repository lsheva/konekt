import type { Feature } from "../kernel/plugin.ts";
import { type Cacao, parseCaipAccount, type Session } from "../kernel/types.ts";

/**
 * Sign-In with Ethereum folded into the session proposal, so the wallet prompts once instead of
 * twice. This half only asks and binds. It never judges a signature: the browser is not a trust
 * boundary, so verification belongs to whoever consumes the CACAO. See `konekt/cacao`.
 */

const DID_PKH = "did:pkh:";

export type SiweOptions = {
  /** The site asking, as it must appear to the wallet. Usually `location.host`. */
  domain: string;
  uri: string;
  /** CAIP-2 ids to authenticate. The wallet returns one CACAO per account it signs for. */
  chains: string[];
  /** Awaited per connect, so a server-issued nonce can be fetched at the moment of pairing. */
  getNonce: () => string | Promise<string>;
  statement?: string | undefined;
  exp?: string | undefined;
  nbf?: string | undefined;
  requestId?: string | undefined;
  resources?: string[] | undefined;
  /**
   * Defaults to true: a wallet that ignores the request fails the connect, because reporting a
   * connection as signed-in when nothing was signed is worse than not connecting. Set false while
   * wallet support is thin, and treat `cacaosOf(session).length` as the signed-in test.
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

/** The CACAOs the wallet returned for the authentication request, if it answered at all. */
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
