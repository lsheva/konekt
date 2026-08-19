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
  /** A temporary WalletConnect URI to render as a QR code or wallet link during pairing. */
  display_uri: string;
  /**
   * Emitted after a session request is published. `url` is present when the wallet advertised a
   * redirect and allows deep links; application UI decides whether to open it.
   */
  request_sent: {
    /** JSON-RPC ID of the published request. */
    id: number;
    /** WalletConnect topic of the approved session. */
    topic: string;
    /** Formatted wallet request URL, or `undefined` when no redirect is available. */
    url: string | undefined;
  };
  /**
   * A new session was approved. `chainId` is absent when no EVM chain is configured because there
   * is no EIP-1193 chain to report.
   */
  connect: { chainId?: Hex | undefined };
  /** The local app or remote wallet ended the session. */
  disconnect: {
    /** WalletConnect reason code. Local user-initiated disconnects use 6000. */
    code: number;
    /** Human-readable reason supplied locally or by the wallet. */
    message: string;
  };
  /** The EVM addresses currently approved by the wallet. */
  accountsChanged: string[];
  /** The active EVM chain changed. The value is hexadecimal, for example `"0x1"`. */
  chainChanged: Hex;
  /** An event declared by a non-EVM forwarding adapter. */
  message: {
    /** Original namespace event name. */
    type: string;
    /** Event payload supplied by the wallet. */
    data: unknown;
  };
};

/** Options shared by {@link Provider.init} and {@link Provider.create}. */
export type CreateProviderOptions<C extends readonly ChainInput[] = readonly ChainInput[]> = {
  /** Project ID from WalletConnect Cloud. It authenticates this app to the relay. */
  projectId: string;
  /** App name, description, URL, and icons shown by the wallet during approval. */
  metadata: Metadata;
  /**
   * Chain objects returned by adapters such as `evm(1)` or `solana`. Arrays returned by adapters
   * may be nested one level, for example `[evm(1, 8453), solana]`.
   */
  chains: C;
  /** Optional proposal features such as `siwe()`. */
  features?: Feature[] | undefined;
  /** WalletConnect relay WebSocket URL. Omit to use the public default. */
  relayUrl?: string | undefined;
  /**
   * Storage for the relay seed and settled session. Omit for `localStorage` in a browser or memory
   * in Node.js. Pass `null` to disable persistence.
   */
  storage?: Storage | null | undefined;
  /** Receives structured protocol diagnostics. Avoid logging secrets in production. */
  onDebug?: OnDebug | undefined;
  /** Protocol lifetimes in seconds. Omitted fields keep their values from {@link TTL}. */
  ttl?: Partial<TtlConfig> | undefined;
};

/**
 * Dependencies that tests can replace when calling {@link Provider.create}. Application code
 * normally omits this object.
 */
export type ProviderDeps = {
  /** Stable 32-byte seed used to authenticate to the relay. */
  seed?: Uint8Array | undefined;
  /** Storage dependency. This takes precedence over `CreateProviderOptions.storage`. */
  storage?: Storage | undefined;
  /** Relay implementation to use instead of opening a WebSocket. */
  relay?: Relay | undefined;
  /**
   * Session implementation to use instead of constructing one. Supplying it prevents Konekt from
   * opening a relay connection.
   */
  session?: Pick<SessionClient, "uri" | "session" | "connect" | "restore" | "request" | "disconnect"> | undefined;
};

/**
 * An EIP-1193-compatible provider backed by a WalletConnect v2 session.
 *
 * Application code should call {@link Provider.init}; tests that need an isolated or injected
 * instance should call {@link Provider.create}.
 *
 * @example
 * ```ts
 * import { Provider } from "konekt";
 * import { evm } from "konekt/eip155";
 *
 * const provider = await Provider.init({
 *   projectId,
 *   metadata,
 *   chains: evm(1),
 * });
 *
 * provider.on("display_uri", showPairingUri);
 * await provider.connect();
 * ```
 */
export class Provider {
  static #singleton: Promise<Provider> | undefined;

  /** Allows provider consumers to identify this as a WalletConnect-backed provider. */
  readonly isWalletConnect = true as const;
  #events: Emitter<ProviderEvents>;
  #session: NonNullable<ProviderDeps["session"]>;
  #chains: Chain[];
  #adapters: ChainAdapter[];
  #features: Feature[];
  #active = new Map<string, string>();

  /**
   * Creates or returns the application-wide provider.
   *
   * The first call fixes the provider options; later calls return the same promise. Konekt uses the
   * default relay and persistent browser storage unless the options override them. Register
   * `display_uri` and `request_sent` listeners before starting work that emits those events.
   *
   * @returns The shared provider, extended with properties supplied by the configured adapters.
   */
  static init<C extends readonly ChainInput[]>(opts: CreateProviderOptions<C>): Promise<Provider & ChainExtensions<C>> {
    Provider.#singleton ??= Provider.create(opts);
    return Provider.#singleton as Promise<Provider & ChainExtensions<C>>;
  }

  /**
   * Creates an independent provider, primarily for tests.
   *
   * Pass `deps` to replace the relay, session, seed, or storage. Supplying `deps.session` keeps the
   * provider offline and does not open a real relay socket.
   *
   * @returns A new provider, extended with properties supplied by the configured adapters.
   */
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

  /**
   * Constructs a provider synchronously.
   *
   * Prefer {@link Provider.init} in applications and {@link Provider.create} in tests because those
   * methods perform asynchronous seed loading and session restoration.
   */
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

  /** The approved session, or `undefined` before connection and after disconnection. */
  get session() {
    return this.#session.session;
  }
  /** Whether the provider currently has an approved session. */
  get connected() {
    return !!this.#session.session;
  }
  /** The temporary pairing URI for the current proposal, when one exists. */
  get uri() {
    return this.#session.uri;
  }
  /**
   * The configured chains this provider proposes, flattened into one list.
   *
   * This is configuration, not proof that the wallet approved every chain. Read {@link session} to
   * inspect the approved namespaces.
   */
  get chains(): readonly Chain[] {
    return this.#chains;
  }
  /**
   * Approved addresses grouped by CAIP-2 chain ID across all namespaces in the current session.
   *
   * @example
   * { "eip155:1": ["0x…"], "cosmos:cosmoshub-4": ["cosmos1…"] }
   */
  get accountsByChain() {
    return accountsByChain(this.#session.session?.namespaces);
  }

  /** Adds an event listener that runs every time the event is emitted. */
  on<K extends keyof ProviderEvents>(e: K, fn: (p: ProviderEvents[K]) => void) {
    this.#events.on(e, fn);
  }
  /** Adds an event listener that removes itself after its first call. */
  once<K extends keyof ProviderEvents>(e: K, fn: (p: ProviderEvents[K]) => void) {
    this.#events.once(e, fn);
  }
  /** Removes a listener previously passed to {@link on} or {@link once}. */
  off<K extends keyof ProviderEvents>(e: K, fn: (p: ProviderEvents[K]) => void) {
    this.#events.off(e, fn);
  }
  /** Alias for {@link off}, provided for EIP-1193 and Node-style event compatibility. */
  removeListener<K extends keyof ProviderEvents>(e: K, fn: (p: ProviderEvents[K]) => void) {
    this.#events.off(e, fn);
  }

  /**
   * Proposes a WalletConnect session and waits for the wallet to approve or reject it.
   *
   * Listen for `display_uri` before calling this method. Pass an `AbortSignal` so closing the
   * pairing UI can cancel the attempt. If a feature rejects the settled session, this method
   * disconnects it before rejecting.
   *
   * @returns The approved WalletConnect session.
   */
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

  /** Ends the current session, clears adapter and feature state, and emits `disconnect`. */
  async disconnect() {
    await this.#session.disconnect();
    for (const adapter of this.#adapters) adapter.onDisconnect?.();
    for (const f of this.#features) f.onDisconnect?.();
    this.#events.emit("disconnect", { code: 6000, message: "User disconnected" });
  }

  /**
   * Legacy EIP-1193 shortcut that connects if needed and returns the approved EVM accounts.
   *
   * New code can call {@link connect} and then read the EVM adapter's `accounts` property.
   */
  async enable() {
    if (!this.#session.session) await this.connect();
    return (await this.request({ method: "eth_requestAccounts" })) as string[];
  }

  /**
   * Sends an EIP-1193 request through the adapter that supports its method.
   *
   * The optional `chainId` is a configured CAIP-2 ID such as `"eip155:8453"`. It targets this call
   * only and does not change the active chain. Wallet methods require a connected session; EVM
   * JSON-RPC reads require a `read` transport on the selected chain.
   *
   * @throws {@link ProviderRpcError} with code 4100 when a wallet method has no session, 4200 when
   * the method or read transport is unsupported, or -32602 for malformed parameters.
   */
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
