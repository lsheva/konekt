import { randomBytes } from "@noble/hashes/utils";
import type { OnDebug } from "./debug.ts";
import { createEmitter, type Emitter } from "./emitter.ts";
import {
  applyProposal,
  type Chain,
  type ChainAdapter,
  type ChainExtensions,
  type ChainInput,
  type Ctx,
  type Feature,
  type ForwardedRequest,
  flattenChains,
  proposeNamespaces,
  type RpcRequest,
  uniqueAdapters,
} from "./plugin.ts";
import { openRelay, relays } from "./relay.ts";
import { type Relay, SessionClient, type SessionEvent } from "./session.ts";
import { defaultStorage, loadSeed, type Storage } from "./storage.ts";
import {
  accountsByChain,
  type Hex,
  type Metadata,
  ProviderRpcError,
  type RequestArguments,
  RpcErrorCode,
  type TtlConfig,
} from "./types.ts";

export type ProviderEvents = {
  display_uri: string;
  request_sent: { id: number; topic: string; url: string | undefined };
  /** `chainId` is absent when no EVM chain is configured; there is no EIP-1193 chain to report. */
  connect: { chainId?: Hex | undefined };
  disconnect: { code: number; message: string };
  accountsChanged: string[];
  chainChanged: Hex;
  message: { type: string; data: unknown };
};

export type CreateProviderOptions<C extends readonly ChainInput[] = readonly ChainInput[]> = {
  projectId: string;
  metadata: Metadata;
  chains: C;
  features?: Feature[] | undefined;
  relayUrl?: string | undefined;
  /** Omit for localStorage (or memory in Node). `null` disables persistence. */
  storage?: Storage | null | undefined;
  onDebug?: OnDebug | undefined;
  /** Overrides for the protocol lifetimes; anything omitted keeps its default. */
  ttl?: Partial<TtlConfig> | undefined;
};

/** Swap these in tests. Omit to build the real relay and session. */
export type ProviderDeps = {
  seed?: Uint8Array | undefined;
  storage?: Storage | undefined;
  relay?: Relay | undefined;
  session?: Pick<SessionClient, "uri" | "session" | "connect" | "restore" | "request" | "disconnect"> | undefined;
};

export class Provider {
  static #singleton: Promise<Provider> | undefined;

  readonly isWalletConnect = true as const;
  #events: Emitter<ProviderEvents>;
  #session: NonNullable<ProviderDeps["session"]>;
  #chains: Chain[];
  #adapters: ChainAdapter[];
  #features: Feature[];
  #active = new Map<string, string>();

  /** App entry. One instance per process, with default relay URL and storage. */
  static init<C extends readonly ChainInput[]>(opts: CreateProviderOptions<C>): Promise<Provider & ChainExtensions<C>> {
    Provider.#singleton ??= Provider.create(opts);
    return Provider.#singleton as Promise<Provider & ChainExtensions<C>>;
  }

  /** Independent instance. Pass `deps` to swap relay, session, seed, or storage. */
  static async create<C extends readonly ChainInput[]>(
    opts: CreateProviderOptions<C>,
    deps: ProviderDeps = {},
  ): Promise<Provider & ChainExtensions<C>> {
    const storage = deps.storage ?? (opts.storage === null ? undefined : (opts.storage ?? defaultStorage()));
    const seed = deps.seed ?? (storage ? await loadSeed(storage) : randomBytes(32));
    const provider = new Provider(opts, { ...deps, seed, storage });
    if (!deps.session) await provider.#restore();
    return provider as Provider & ChainExtensions<C>;
  }

  constructor(opts: CreateProviderOptions, deps: ProviderDeps = {}) {
    this.#events = createEmitter();
    this.#chains = flattenChains(opts.chains);
    if (!this.#chains.length) throw new Error("UNSUPPORTED_CHAINS");
    this.#adapters = uniqueAdapters(this.#chains);
    this.#features = opts.features ?? [];
    for (const c of this.#chains) {
      if (!this.#active.has(c.namespace)) this.#active.set(c.namespace, c.id);
    }

    if (deps.session) {
      this.#session = deps.session;
      this.#applyExtensions();
      return;
    }

    const seed = deps.seed ?? randomBytes(32);
    const openSession = (relay: Relay) =>
      new SessionClient({
        relay,
        metadata: opts.metadata,
        namespaces: proposeNamespaces(this.#chains),
        onProposal: (p) => applyProposal(this.#features, p),
        onUri: (uri) => this.#events.emit("display_uri", uri),
        onEvent: (e) => this.#onSessionEvent(e),
        storage: deps.storage,
        onDebug: opts.onDebug,
        onRequestSent: (e) => this.#events.emit("request_sent", e),
        ttl: opts.ttl,
      });

    if (deps.relay) {
      this.#session = openSession(deps.relay);
      this.#applyExtensions();
      return;
    }

    const relay = openRelay({ projectId: opts.projectId, seed, url: opts.relayUrl, onDebug: opts.onDebug });
    this.#session = openSession(relay);
    relays.set(this, relay);
    this.#applyExtensions();
  }

  #ctx(): Ctx {
    return {
      session: () => this.#session.session,
      emit: (event, payload) => this.#events.emit(event as keyof ProviderEvents, payload as never),
      chains: this.#chains,
      activeChainId: (ns) => this.#active.get(ns),
      setActiveChainId: (ns, id) => {
        this.#active.set(ns, id);
      },
      forward: (req) => this.#forward(req),
    };
  }

  #configured(chainId: string): string {
    if (this.#chains.some((c) => c.id === chainId)) return chainId;
    throw new ProviderRpcError(
      RpcErrorCode.invalidParams,
      `Chain "${chainId}" is not configured. Add it to chains before targeting it.`,
    );
  }

  #forward(req: ForwardedRequest) {
    if (!this.#session.session)
      throw new ProviderRpcError(RpcErrorCode.unauthorized, `No session. Call connect() before ${req.method}.`);
    return this.#session.request(req);
  }

  #applyExtensions() {
    const ctx = this.#ctx();
    for (const adapter of this.#adapters) {
      const ext = adapter.extend?.(ctx);
      if (!ext) continue;
      Object.defineProperties(this, Object.getOwnPropertyDescriptors(ext));
    }
  }

  async #restore() {
    if ((await this.#session.restore()) && this.#session.session) {
      const ctx = this.#ctx();
      for (const adapter of this.#adapters) adapter.onSettle?.(this.#session.session, ctx);
    }
  }

  get session() {
    return this.#session.session;
  }
  get connected() {
    return !!this.#session.session;
  }
  get uri() {
    return this.#session.uri;
  }
  /** The chains this provider proposes, flattened. What a session may cover, not what it covers. */
  get chains(): readonly Chain[] {
    return this.#chains;
  }
  /** Approved addresses grouped by CAIP-2 chain id, across every namespace in the session. */
  get accountsByChain() {
    return accountsByChain(this.#session.session?.namespaces);
  }

  on<K extends keyof ProviderEvents>(e: K, fn: (p: ProviderEvents[K]) => void) {
    this.#events.on(e, fn);
  }
  once<K extends keyof ProviderEvents>(e: K, fn: (p: ProviderEvents[K]) => void) {
    this.#events.once(e, fn);
  }
  off<K extends keyof ProviderEvents>(e: K, fn: (p: ProviderEvents[K]) => void) {
    this.#events.off(e, fn);
  }
  removeListener<K extends keyof ProviderEvents>(e: K, fn: (p: ProviderEvents[K]) => void) {
    this.#events.off(e, fn);
  }

  async connect({ signal }: { signal?: AbortSignal | undefined } = {}) {
    const s = await this.#session.connect(signal);
    const ctx = this.#ctx();
    for (const adapter of this.#adapters) adapter.onSettle?.(s, ctx);
    try {
      for (const f of this.#features) await f.onSettle?.(s);
    } catch (e) {
      // The session is already settled and persisted. A feature that rejects it must not leave one behind.
      await this.disconnect().catch(() => {});
      throw e;
    }
    const evmChainId = (this as Provider & { chainId?: number }).chainId;
    this.#events.emit("connect", evmChainId === undefined ? {} : { chainId: `0x${evmChainId.toString(16)}` as Hex });
    return s;
  }

  async disconnect() {
    await this.#session.disconnect();
    for (const adapter of this.#adapters) adapter.onDisconnect?.();
    for (const f of this.#features) f.onDisconnect?.();
    this.#events.emit("disconnect", { code: 6000, message: "User disconnected" });
  }

  async enable() {
    if (!this.#session.session) await this.connect();
    return (await this.request({ method: "eth_requestAccounts" })) as string[];
  }

  /** `chainId` targets an approved CAIP-2 chain for this call only, leaving the active chain alone. */
  async request({ method, params }: RequestArguments, chainId?: string) {
    const req: RpcRequest = { method, params, chainId: chainId && this.#configured(chainId) };
    const ctx = this.#ctx();
    for (const adapter of this.#adapters) {
      const out = await adapter.handle?.(req, ctx);
      if (out !== undefined) return out;
    }
    throw new ProviderRpcError(RpcErrorCode.unsupportedMethod, `Unsupported method: ${method}`);
  }

  #onSessionEvent(e: SessionEvent) {
    const ctx = this.#ctx();
    switch (e.type) {
      case "event":
        for (const adapter of this.#adapters) adapter.onEvent?.(e.name, e.data, e.chainId, ctx);
        break;
      case "update":
        for (const adapter of this.#adapters) adapter.onEvent?.("session_update", e.namespaces, undefined, ctx);
        break;
      case "delete":
        for (const adapter of this.#adapters) adapter.onDisconnect?.();
        for (const f of this.#features) f.onDisconnect?.();
        this.#events.emit("disconnect", { code: e.code, message: e.message });
        break;
    }
  }
}
