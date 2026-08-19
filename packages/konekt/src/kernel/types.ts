/** A hexadecimal string with a `0x` prefix. */
export type Hex = `0x${string}`;

/** Application details shown by the wallet when it asks the user to approve a session. */
export type Metadata = {
  /** Human-readable application name. */
  name: string;
  /** Short explanation of what the application does. */
  description: string;
  /** Canonical application URL. */
  url: string;
  /** Absolute image URLs the wallet may use as the application icon. */
  icons: string[];
  /** Optional native and universal return URLs advertised to the wallet. */
  redirect?: { native?: string; universal?: string };
};

/** Methods, events, chains, and accounts approved for one WalletConnect namespace. */
export type Namespace = {
  /** CAIP-2 chain IDs approved in this namespace. */
  chains?: string[];
  /** Approved CAIP-10 accounts in `namespace:reference:address` form. */
  accounts?: string[];
  /** JSON-RPC methods the wallet approved. */
  methods: string[];
  /** Session event names the wallet approved. */
  events: string[];
};

/**
 * A CAIP-74 Chain Agnostic CApability Object returned by proposal authentication.
 *
 * `p` is the signed payload. `s.t` identifies the signature scheme; Konekt verifies `eip191` and
 * `eip1271`.
 */
export type Cacao = {
  /** Header. CAIP-74 authentication responses use type `caip122`. */
  h: { t: string };
  /** Claims and sign-in message fields covered by the signature. */
  p: CacaoPayload;
  /** Signature type, signature bytes, and optional reconstructed message. */
  s: { t: string; s: string; m?: string };
};

/** Claims signed into a CACAO authentication response. */
export type CacaoPayload = {
  /** Signing account as a `did:pkh` identifier, for example `did:pkh:eip155:1:0xabc…`. */
  iss: string;
  /** Application host the wallet displayed as the party requesting authentication. */
  domain: string;
  /** Audience URI used by proposal authentication. */
  aud?: string;
  /** Legacy audience field used when `aud` is absent. */
  uri?: string;
  /** Message format version, currently `"1"`. */
  version: string;
  /** Single-use challenge issued by the application server. */
  nonce: string;
  /** ISO timestamp for when the message was issued. */
  iat: string;
  /** Optional ISO timestamp before which the message is not valid. */
  nbf?: string;
  /** Optional ISO timestamp after which the message is expired. */
  exp?: string;
  /** Optional human-readable reason for signing in. */
  statement?: string;
  /** Optional application-specific request identifier. */
  requestId?: string;
  /** Optional resource URIs covered by the authentication message. */
  resources?: string[];
};

/**
 * What the wallet returned for each `Proposal.requests` entry. The kernel carries the container
 * without reading it; a feature reads the key it asked under.
 */
export type ProposalRequestsResponses = {
  /** CACAOs returned for a CAIP-122 authentication request. */
  authentication?: Cacao[];
  [key: string]: unknown;
};

/** An approved WalletConnect session and the namespaces granted by its wallet. */
export type Session = {
  /** Topic used to encrypt and route session requests. */
  topic: string;
  /** Topic of the pairing that created this session. */
  pairingTopic: string;
  /** Relay protocol selected by the wallet. */
  relay: { protocol: string };
  /** Unix timestamp in seconds when the session expires. */
  expiry: number;
  /** Approved methods, events, chains, and accounts grouped by namespace. */
  namespaces: Record<string, Namespace>;
  /** Public key of the wallet that controls the session. */
  controller: string;
  /** This application's session identity and metadata. */
  self: { publicKey: string; metadata: Metadata };
  /** Connected wallet's session identity and metadata. */
  peer: { publicKey: string; metadata: Metadata };
  /** Wallet-provided session behavior, including whether request deep links are disabled. */
  sessionConfig?: { disableDeepLink?: boolean };
  /** Responses to feature-owned requests that were attached to the session proposal. */
  proposalRequestsResponses?: ProposalRequestsResponses | undefined;
};

/** EIP-1193 request input. `params` must match the selected JSON-RPC method. */
export type RequestArguments = { method: string; params?: unknown | undefined };

/** A parsed CAIP-10 account: its CAIP-2 chain ID and namespace-specific address. */
export type CaipAccount = { chainId: string; address: string };

/**
 * Splits a CAIP-10 account into its CAIP-2 chain ID and address.
 *
 * @param account Account in `namespace:reference:address` form.
 * @returns The parsed account, or `undefined` when any required part is missing.
 *
 * @example
 * `parseCaipAccount("eip155:1:0xabc")` returns
 * `{ chainId: "eip155:1", address: "0xabc" }`.
 */
export function parseCaipAccount(account: string): CaipAccount | undefined {
  const [namespace, reference, address] = account.split(":");
  if (!namespace || !reference || !address) return;
  return { chainId: `${namespace}:${reference}`, address };
}

/**
 * Groups approved session addresses by CAIP-2 chain ID.
 *
 * Addresses stay separated by chain because some namespaces, including Cosmos, use a different
 * address for each chain.
 *
 * @returns A new record. Missing namespaces produce an empty object.
 */
export function accountsByChain(namespaces: Session["namespaces"] | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const namespace of Object.values(namespaces ?? {})) {
    for (const account of namespace.accounts ?? []) {
      const parsed = parseCaipAccount(account);
      if (!parsed) continue;
      const addresses = out[parsed.chainId] ?? [];
      if (!addresses.includes(parsed.address)) addresses.push(parsed.address);
      out[parsed.chainId] = addresses;
    }
  }
  return out;
}

/** JSON-RPC and EIP-1193 error codes thrown directly by Konekt. */
export const RpcErrorCode = {
  /** JSON-RPC invalid parameters. */
  invalidParams: -32602,
  /** EIP-1193 unauthorized: a wallet method was requested without a session. */
  unauthorized: 4100,
  /** EIP-1193 unsupported method or missing EVM read transport. */
  unsupportedMethod: 4200,
} as const;

/** Error with a JSON-RPC or EIP-1193 numeric `code`. */
export class ProviderRpcError extends Error {
  /** JSON-RPC or EIP-1193 error code. */
  readonly code: number;
  /** Creates a provider error with a machine-readable code and human-readable message. */
  constructor(code: number, message: string) {
    super(message);
    this.name = "ProviderRpcError";
    this.code = code;
  }
}

export const TAG = {
  sessionPropose: 1100,
  sessionProposeRes: 1101,
  sessionSettle: 1102,
  sessionSettleRes: 1103,
  sessionRequest: 1108,
  sessionRequestRes: 1109,
  sessionUpdate: 1104,
  sessionUpdateRes: 1105,
  sessionExtend: 1106,
  sessionExtendRes: 1107,
  sessionDelete: 1112,
  sessionPing: 1114,
  sessionPingRes: 1115,
} as const;

/** WalletConnect protocol lifetimes, in seconds. */
export type TtlConfig = {
  /** How long a pairing proposal stays valid, in seconds. */
  propose: number;
  /** How long a wallet has to answer a request before it is rejected locally, in seconds. */
  request: number;
  /** Lifetime of a settled session, in seconds. */
  session: number;
  /** Minimum relay storage window, in seconds, independent of the payload expiry. */
  minPublish: number;
};

/** Default WalletConnect protocol lifetimes, in seconds. */
export const TTL: TtlConfig = {
  propose: 300,
  request: 900,
  session: 86400,
  minPublish: 300,
};
