export type Hex = `0x${string}`;

export type Metadata = {
  name: string;
  description: string;
  url: string;
  icons: string[];
  redirect?: { native?: string; universal?: string };
};

export type Namespace = {
  chains?: string[];
  accounts?: string[];
  methods: string[];
  events: string[];
};

/** CAIP-74. `p` is the signed payload; `s.t` names the scheme, so far only the two EVM ones. */
export type Cacao = {
  h: { t: string };
  p: CacaoPayload;
  s: { t: string; s: string; m?: string };
};

export type CacaoPayload = {
  /** CAIP-10 account as a DID, `did:pkh:eip155:1:0xabc…`. */
  iss: string;
  domain: string;
  aud?: string;
  uri?: string;
  version: string;
  nonce: string;
  iat: string;
  nbf?: string;
  exp?: string;
  statement?: string;
  requestId?: string;
  resources?: string[];
};

/**
 * What the wallet returned for each `Proposal.requests` entry. The kernel carries the container
 * without reading it; a feature reads the key it asked under.
 */
export type ProposalRequestsResponses = {
  authentication?: Cacao[];
  [key: string]: unknown;
};

export type Session = {
  topic: string;
  pairingTopic: string;
  relay: { protocol: string };
  expiry: number;
  namespaces: Record<string, Namespace>;
  controller: string;
  self: { publicKey: string; metadata: Metadata };
  peer: { publicKey: string; metadata: Metadata };
  sessionConfig?: { disableDeepLink?: boolean };
  proposalRequestsResponses?: ProposalRequestsResponses | undefined;
};

export type RequestArguments = { method: string; params?: unknown | undefined };

export type CaipAccount = { chainId: string; address: string };

/** Splits a CAIP-10 `namespace:reference:address` into its CAIP-2 chain id and address. */
export function parseCaipAccount(account: string): CaipAccount | undefined {
  const [namespace, reference, address] = account.split(":");
  if (!namespace || !reference || !address) return;
  return { chainId: `${namespace}:${reference}`, address };
}

/** Approved addresses grouped by CAIP-2 chain id. Cosmos addresses differ per chain, so this cannot flatten. */
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

export const RpcErrorCode = {
  invalidParams: -32602,
  unauthorized: 4100,
  unsupportedMethod: 4200,
} as const;

export class ProviderRpcError extends Error {
  readonly code: number;
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

export type TtlConfig = {
  /** How long a pairing proposal stays valid. */
  propose: number;
  /** How long a wallet has to answer a request before it is rejected locally. */
  request: number;
  /** Lifetime of a settled session. */
  session: number;
  /** Relays reject shorter storage windows with TtlTooShort, independent of the payload expiry. */
  minPublish: number;
};

export const TTL: TtlConfig = {
  propose: 300,
  request: 900,
  session: 86400,
  minPublish: 300,
};
