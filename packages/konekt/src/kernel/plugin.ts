import { type Metadata, ProviderRpcError, type RequestArguments, RpcErrorCode, type Session } from "./types.ts";

export type RpcRequest = {
  method: string;
  params?: unknown | undefined;
  /** The chain the caller targeted for this one call. Absent means "wherever this namespace is active". */
  chainId?: string | undefined;
};

/** An `RpcRequest` after an adapter has resolved which chain it goes to. */
export type ForwardedRequest = RpcRequest & { chainId: string };

export type Ctx = {
  session: () => Session | undefined;
  emit: (event: string, payload: unknown) => void;
  chains: Chain[];
  activeChainId: (namespace: string) => string | undefined;
  setActiveChainId: (namespace: string, id: string) => void;
  forward: (req: ForwardedRequest) => Promise<unknown>;
};

export type ChainAdapter<Ext = object> = {
  namespace: string;
  methods: string[];
  events: string[];
  handle?: ((req: RpcRequest, ctx: Ctx) => Promise<unknown> | unknown) | undefined;
  extend?: ((ctx: Ctx) => Ext) | undefined;
  onSettle?: ((session: Session, ctx: Ctx) => void) | undefined;
  onEvent?: ((name: string, data: unknown, chainId: string | undefined, ctx: Ctx) => void) | undefined;
  onDisconnect?: (() => void) | undefined;
};

export type Chain<Ext = object> = {
  namespace: string;
  id: string;
  adapter: ChainAdapter<Ext>;
  read?: ((req: RequestArguments) => Promise<unknown>) | undefined;
};

export type ChainInput = Chain | readonly Chain[];

export type Proposal = {
  requiredNamespaces: Record<string, { chains?: string[]; methods: string[]; events: string[] }>;
  optionalNamespaces: Record<string, { chains: string[]; methods: string[]; events: string[] }>;
  relays: { protocol: string }[];
  proposer: { publicKey: string; metadata: Metadata };
  expiryTimestamp: number;
  /** Feature-owned side requests. A feature writes its own key and reads the matching key back
   * off `Session.proposalRequestsResponses`. */
  requests?: Record<string, unknown> | undefined;
};

export type Feature = {
  name: string;
  /** Runs before the proposal is published, so it may await work like fetching a server nonce. */
  onProposal?: ((p: Proposal) => Proposal | undefined | Promise<Proposal | undefined>) | undefined;
  /** Throwing rejects `connect()` and tears the session down. */
  onSettle?: ((s: Session) => void | Promise<void>) | undefined;
  onDisconnect?: (() => void) | undefined;
};

type Inner<T> = T extends readonly (infer U)[] ? U : T;
export type FlattenChains<C extends readonly unknown[]> = Inner<C[number]>;

type AdapterExt<C> = C extends Chain<infer E> ? E : object;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type ChainExtensions<C extends readonly unknown[]> = UnionToIntersection<AdapterExt<FlattenChains<C>>>;

/** An explicitly targeted chain wins, then the active one, then the first configured in the namespace. */
export function resolveChainId(req: RpcRequest, ctx: Ctx, namespace: string): string | undefined {
  if (req.chainId?.startsWith(`${namespace}:`)) return req.chainId;
  return ctx.activeChainId(namespace) ?? ctx.chains.find((c) => c.namespace === namespace)?.id;
}

/**
 * A wallet may approve fewer methods than were proposed. Sending one it declined gets an opaque
 * wallet-side error, so refuse locally instead. A namespace the session does not describe fails
 * open: the wallet is the authority on what it accepted.
 */
export function requireApprovedMethod(ctx: Ctx, namespace: string, method: string): void {
  const approved = ctx.session()?.namespaces[namespace]?.methods;
  if (!approved || approved.includes(method)) return;
  throw new ProviderRpcError(
    RpcErrorCode.unsupportedMethod,
    `The wallet did not approve "${method}" for ${namespace}. It approved: ${approved.join(", ") || "nothing"}.`,
  );
}

export function flattenChains(chains: readonly ChainInput[]): Chain[] {
  const out: Chain[] = [];
  for (const c of chains) {
    if ("adapter" in c) out.push(c);
    else out.push(...c);
  }
  return out;
}

export function uniqueAdapters(chains: readonly Chain[]): ChainAdapter[] {
  const seen = new Set<ChainAdapter>();
  const out: ChainAdapter[] = [];
  for (const c of chains) {
    if (seen.has(c.adapter)) continue;
    seen.add(c.adapter);
    out.push(c.adapter);
  }
  return out;
}

export function proposeNamespaces(chains: readonly Chain[]): Proposal["optionalNamespaces"] {
  const map = new Map<string, { chains: string[]; methods: Set<string>; events: Set<string> }>();
  for (const c of chains) {
    let g = map.get(c.namespace);
    if (!g) {
      g = { chains: [], methods: new Set(c.adapter.methods), events: new Set(c.adapter.events) };
      map.set(c.namespace, g);
    }
    g.chains.push(c.id);
    for (const m of c.adapter.methods) g.methods.add(m);
    for (const e of c.adapter.events) g.events.add(e);
  }
  return Object.fromEntries(
    [...map].map(([ns, g]) => [ns, { chains: g.chains, methods: [...g.methods], events: [...g.events] }]),
  );
}

export async function applyProposal(features: readonly Feature[], proposal: Proposal): Promise<Proposal> {
  let next = proposal;
  for (const f of features) {
    const out = await f.onProposal?.(next);
    if (out) next = out;
  }
  return next;
}
