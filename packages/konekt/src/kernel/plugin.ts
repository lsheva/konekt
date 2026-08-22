import { type Metadata, ProviderRpcError, type RequestArguments, RpcErrorCode, type Session } from "./types.ts";

/** Request passed to chain adapters. */
export type RpcRequest = {
  /** JSON-RPC method name. */
  method: string;
  /** Method-specific parameters supplied by the caller. */
  params?: unknown | undefined;
  /** CAIP-2 chain explicitly targeted for this call, or absent to use the namespace's active chain. */
  chainId?: string | undefined;
};

/** An `RpcRequest` after an adapter has resolved which chain it goes to. */
export type ForwardedRequest = RpcRequest & { chainId: string };

/** Provider operations and state exposed to a chain adapter. */
export type Ctx = {
  /** Reads the current approved session. */
  session: () => Session | undefined;
  /** Emits a public provider event. */
  emit: (event: string, payload: unknown) => void;
  /** All chains configured on the provider. */
  chains: Chain[];
  /** Reads the active CAIP-2 chain ID for a namespace. */
  activeChainId: (namespace: string) => string | undefined;
  /** Replaces the active CAIP-2 chain ID for a namespace. */
  setActiveChainId: (namespace: string, id: string) => void;
  /** Sends a fully targeted request through the WalletConnect session. */
  forward: (req: ForwardedRequest) => Promise<unknown>;
};

/**
 * Behavior shared by every configured chain in a namespace.
 *
 * `handle` returns `undefined` when the adapter does not own a method. Any other value, including
 * `null`, is the final result. `extend` may add namespace-specific properties to the provider.
 */
export type ChainAdapter<Ext = object> = {
  /** CAIP-2 namespace, for example `"eip155"` or `"solana"`. */
  namespace: string;
  /** Wallet methods proposed for this namespace. */
  methods: string[];
  /** Wallet events proposed for this namespace. */
  events: string[];
  /** Handles a supported request, or returns `undefined` so another adapter may handle it. */
  handle?: ((req: RpcRequest, ctx: Ctx) => Promise<unknown> | unknown) | undefined;
  /** Adds namespace-specific getters or methods to the provider. */
  extend?: ((ctx: Ctx) => Ext) | undefined;
  /** Updates adapter state after a session is approved or restored. */
  onSettle?: ((session: Session, ctx: Ctx) => void) | undefined;
  /** Maps a session event to adapter state and public provider events. */
  onEvent?: ((name: string, data: unknown, chainId: string | undefined, ctx: Ctx) => void) | undefined;
  /** Clears adapter-owned state after disconnection. */
  onDisconnect?: (() => void) | undefined;
};

/** One configured CAIP-2 chain and the adapter that handles its namespace. */
export type Chain<Ext = object> = {
  /** CAIP-2 namespace, such as `"eip155"`. */
  namespace: string;
  /** Complete CAIP-2 ID, such as `"eip155:1"`. */
  id: string;
  /** Shared behavior for this chain's namespace. */
  adapter: ChainAdapter<Ext>;
  /** Optional transport for chain reads. The built-in EVM adapter uses it for JSON-RPC reads. */
  read?: ((req: RequestArguments) => Promise<unknown>) | undefined;
};

/** A single chain or one array of chains; the kernel flattens one level of nesting. */
export type ChainInput = Chain | readonly Chain[];

/** WalletConnect session proposal before it is published to the relay. */
export type Proposal = {
  /** Namespace capabilities the wallet must support. */
  requiredNamespaces: Record<string, { chains?: string[]; methods: string[]; events: string[] }>;
  /** Namespace capabilities the wallet may approve. Konekt puts configured chains here. */
  optionalNamespaces: Record<string, { chains: string[]; methods: string[]; events: string[] }>;
  /** Relay protocols supported by the proposing app. */
  relays: { protocol: string }[];
  /** App identity and metadata presented to the wallet. */
  proposer: { publicKey: string; metadata: Metadata };
  /** Unix timestamp in seconds when the proposal expires. */
  expiryTimestamp: number;
  /**
   * Feature-owned side requests. A feature writes its own key and reads the matching key from
   * `Session.proposalRequestsResponses`.
   */
  requests?: Record<string, unknown> | undefined;
};

/** Optional hooks that add behavior to session setup without intercepting normal requests. */
export type Feature = {
  /** Stable feature name used for diagnostics. */
  name: string;
  /**
   * Runs before the proposal is published. It may await work such as fetching a server nonce and
   * may return a replacement proposal.
   */
  onProposal?: ((p: Proposal) => Proposal | undefined | Promise<Proposal | undefined>) | undefined;
  /** Runs after approval. Throwing rejects `connect()` and tears the new session down. */
  onSettle?: ((s: Session) => void | Promise<void>) | undefined;
  /** Clears feature-owned state after the session ends. */
  onDisconnect?: (() => void) | undefined;
};

type Inner<T> = T extends readonly (infer U)[] ? U : T;
/** Type-level helper that flattens one level of chain inputs. */
export type FlattenChains<C extends readonly unknown[]> = Inner<C[number]>;

type AdapterExt<C> = C extends Chain<infer E> ? E : object;

type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

/** Type-level intersection of the provider extensions supplied by configured chain adapters. */
export type ChainExtensions<C extends readonly unknown[]> = UnionToIntersection<AdapterExt<FlattenChains<C>>>;

/**
 * Selects the chain for a namespace.
 *
 * An explicitly targeted chain wins, followed by the active chain and then the first configured
 * chain in the namespace.
 *
 * @returns A CAIP-2 chain ID, or `undefined` when the provider has no chain in that namespace.
 */
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
