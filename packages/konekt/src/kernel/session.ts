import { decrypt, deriveSymKey, encrypt, generateX25519, hashKey, randomHex32 } from "./crypto.ts";
import { log, type OnDebug } from "./debug.ts";
import type { Proposal } from "./plugin.ts";
import { formatWalletRedirect, shouldRedirect } from "./redirect.ts";
import { STORE, type Storage } from "./storage.ts";
import { type Metadata, type ProposalRequestsResponses, type Session, TAG, TTL, type TtlConfig } from "./types.ts";
import { formatUri } from "./uri.ts";

export type SessionEvent =
  | { type: "event"; name: string; data: unknown; chainId?: string }
  | { type: "update"; namespaces: Session["namespaces"] }
  | { type: "extend"; expiry: number }
  | { type: "delete"; code: number; message: string };

export type Relay = {
  connect: () => Promise<void>;
  close: () => Promise<void>;
  subscribe: (topic: string) => Promise<void>;
  publish: (
    topic: string,
    message: string,
    opts: { ttl: number; tag: number; prompt?: boolean },
    signal?: AbortSignal,
  ) => Promise<void>;
  proposeSession: (pairingTopic: string, sessionProposal: string, ttl: number) => Promise<void>;
  onMessage: (fn: (topic: string, message: string) => void) => void;
};

export type SessionOpts = {
  relay: Relay;
  metadata: Metadata;
  namespaces: Proposal["optionalNamespaces"];
  onProposal?: ((p: Proposal) => Promise<Proposal>) | undefined;
  onUri?: (uri: string) => void;
  storage?: Storage | undefined;
  onEvent?: (e: SessionEvent) => void;
  onDebug?: OnDebug | undefined;
  onRequestSent?: ((e: { id: number; topic: string; url: string | undefined }) => void) | undefined;
  ttl?: Partial<TtlConfig> | undefined;
};

type Json = {
  id: number;
  jsonrpc: "2.0";
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
};

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

const payloadId = () => Date.now() * 1e3 + Math.floor(Math.random() * 1e3);
const now = () => (Date.now() / 1e3) | 0;
const outOfSync = (last: number | undefined, id: number) =>
  last !== undefined && id.toString().slice(0, -3) < last.toString().slice(0, -3);
const DELETE_WAIT_MS = 500;

export class SessionClient {
  #relay: Relay;
  #metadata: Metadata;
  #namespaces: Proposal["optionalNamespaces"];
  #onProposal: ((p: Proposal) => Promise<Proposal>) | undefined;
  #onUri: ((uri: string) => void) | undefined;
  #storage: Storage | undefined;
  #onEvent: ((e: SessionEvent) => void) | undefined;
  #onDebug: OnDebug | undefined;
  #onRequestSent: ((e: { id: number; topic: string; url: string | undefined }) => void) | undefined;
  #ttl: TtlConfig;
  #keys = new Map<string, string>();
  #pending = new Map<number, Pending>();
  #self: Awaited<ReturnType<typeof generateX25519>> | undefined;
  #selfPromise: Promise<Awaited<ReturnType<typeof generateX25519>>> | undefined;
  #messages = Promise.resolve();
  #pairingTopic: string | undefined;
  #proposalId: number | undefined;
  #lastUpdateId: number | undefined;
  #lastExtendId: number | undefined;
  #settleWait: { resolve: (s: Session) => void; reject: (e: Error) => void } | undefined;
  #settleTimer: ReturnType<typeof setTimeout> | undefined;
  #current: Session | undefined;
  #uri: string | undefined;

  constructor(opts: SessionOpts) {
    if (!Object.values(opts.namespaces).some((n) => n.chains.length)) throw new Error("UNSUPPORTED_CHAINS");
    this.#relay = opts.relay;
    this.#metadata = opts.metadata;
    this.#namespaces = opts.namespaces;
    this.#onProposal = opts.onProposal;
    this.#onUri = opts.onUri;
    this.#storage = opts.storage;
    this.#onEvent = opts.onEvent;
    this.#onDebug = opts.onDebug;
    this.#onRequestSent = opts.onRequestSent;
    this.#ttl = { ...TTL, ...opts.ttl };
    this.#relay.onMessage((topic, message) => {
      this.#messages = this.#messages
        .then(() => this.#onMessage(topic, message))
        .catch((e) => {
          const error = e instanceof Error ? e : new Error(String(e));
          this.#finishSettle()?.reject(error);
          log("i", "session message failed", { error: error.message });
        });
    });
  }

  get uri() {
    return this.#uri;
  }

  get session() {
    return this.#current;
  }

  #prepareSelf() {
    this.#selfPromise ??= generateX25519().then(
      (self) => {
        this.#self = self;
        return self;
      },
      (error) => {
        this.#selfPromise = undefined;
        throw error;
      },
    );
    return this.#selfPromise;
  }

  async restore() {
    const storage = this.#storage;
    if (!storage) return false;
    const raw = await storage.getItem(STORE.session);
    const keysRaw = await storage.getItem(STORE.keys);
    if (!raw || !keysRaw) return false;
    this.#current = JSON.parse(raw) as Session;
    this.#pairingTopic = this.#current.pairingTopic;
    for (const [topic, sym] of Object.entries(JSON.parse(keysRaw) as Record<string, string>))
      this.#keys.set(topic, sym);
    await this.#relay.connect();
    await this.#relay.subscribe(this.#current.topic);
    return true;
  }

  async connect(signal?: AbortSignal) {
    const self = await this.#prepareSelf();
    const pairingSym = randomHex32();
    this.#pairingTopic = await hashKey(pairingSym);
    this.#put(this.#pairingTopic, pairingSym);
    const expiryTimestamp = now() + this.#ttl.propose;
    this.#uri = formatUri({
      protocol: "wc",
      topic: this.#pairingTopic,
      version: 2,
      symKey: pairingSym,
      relay: { protocol: "irn" },
      expiryTimestamp,
    });
    log("i", "display_uri", { pairingTopic: this.#pairingTopic, expiryTimestamp });
    this.#onUri?.(this.#uri);

    await this.#relay.connect();

    this.#proposalId = payloadId();
    const base: Proposal = {
      requiredNamespaces: {},
      optionalNamespaces: this.#namespaces,
      relays: [{ protocol: "irn" }],
      proposer: { publicKey: self.publicKey, metadata: this.#metadata },
      expiryTimestamp,
    };
    const proposal = {
      id: this.#proposalId,
      jsonrpc: "2.0" as const,
      method: "wc_sessionPropose",
      params: this.#onProposal ? await this.#onProposal(base) : base,
    };
    try {
      log("→", "wc_proposeSession", { id: this.#proposalId, pairingTopic: this.#pairingTopic });
      await this.#relay.proposeSession(
        this.#pairingTopic,
        await encrypt(pairingSym, JSON.stringify(proposal)),
        this.#ttl.propose,
      );
    } catch (e) {
      log("i", "wc_proposeSession failed, falling back", { error: (e as Error).message });
      await this.#relay.subscribe(this.#pairingTopic);
      await this.#pub(this.#pairingTopic, proposal, { ttl: this.#ttl.propose, tag: TAG.sessionPropose, prompt: true });
    }

    return await new Promise<Session>((resolve, reject) => {
      this.#settleWait = { resolve, reject };
      const onAbort = () => this.#finishSettle()?.reject(new DOMException("Aborted", "AbortError"));
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#settleTimer = setTimeout(
        () => this.#finishSettle()?.reject(new Error("proposal expired")),
        this.#ttl.propose * 1000,
      );
    });
  }

  request({ method, params, chainId }: { method: string; params?: unknown | undefined; chainId: string }) {
    if (!this.#current) return Promise.reject(new Error("no session"));
    const id = payloadId();
    const expiryTimestamp = now() + this.#ttl.request;
    const topic = this.#current.topic;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.#pending.delete(id)) reject(new Error("request expired"));
      }, this.#ttl.request * 1000);
      if (typeof (timer as NodeJS.Timeout).unref === "function") (timer as NodeJS.Timeout).unref();
      this.#pending.set(id, { resolve, reject, timer });
      void this.#pub(
        topic,
        {
          id,
          jsonrpc: "2.0",
          method: "wc_sessionRequest",
          params: { request: { method, params, expiryTimestamp }, chainId },
        },
        { ttl: Math.max(this.#ttl.request, this.#ttl.minPublish), tag: TAG.sessionRequest, prompt: true },
      )
        .then(() => this.#notifyRequestSent(id, topic))
        .catch((e) => {
          if (this.#pending.delete(id)) {
            clearTimeout(timer);
            reject(e);
          }
        });
    });
  }

  async disconnect() {
    this.#failPending(new Error("disconnected"));
    this.#finishSettle()?.reject(new Error("disconnected"));
    if (this.#current) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), DELETE_WAIT_MS);
      if (typeof (timer as NodeJS.Timeout).unref === "function") (timer as NodeJS.Timeout).unref();
      try {
        await this.#pub(
          this.#current.topic,
          {
            id: payloadId(),
            jsonrpc: "2.0",
            method: "wc_sessionDelete",
            params: { code: 6000, message: "User disconnected" },
          },
          { ttl: this.#ttl.session, tag: TAG.sessionDelete },
          ac.signal,
        );
      } catch {
        // Relay down, or the delete wait elapsed. close() drops any leftover ack.
      } finally {
        clearTimeout(timer);
      }
    }
    await this.#clearSession();
    await this.#relay.close();
  }

  #finishSettle() {
    if (this.#settleTimer) clearTimeout(this.#settleTimer);
    this.#settleTimer = undefined;
    const wait = this.#settleWait;
    this.#settleWait = undefined;
    return wait;
  }

  /** Fire-and-forget work must never reject into the global handler; a dropped socket is normal. */
  #fire(what: string, p: Promise<unknown>) {
    void p.catch((e) => log("i", `${what} failed`, { error: (e as Error).message }));
  }

  #put(topic: string, sym: string) {
    this.#keys.set(topic, sym);
    this.#fire("persist keys", this.#persistKeys());
  }

  async #persistKeys() {
    if (!this.#storage) return;
    await this.#storage.setItem(STORE.keys, JSON.stringify(Object.fromEntries(this.#keys)));
  }

  async #persistSession() {
    if (!this.#storage || !this.#current) return;
    await this.#storage.setItem(STORE.session, JSON.stringify(this.#current));
    await this.#persistKeys();
  }

  async #clearSession() {
    this.#current = undefined;
    if (this.#storage) await this.#storage.removeItem(STORE.session);
  }

  #failPending(err: Error) {
    for (const [, p] of this.#pending) {
      if (p.timer) clearTimeout(p.timer);
      p.reject(err);
    }
    this.#pending.clear();
  }

  async #pub(
    topic: string,
    payload: object,
    pubOpts: { ttl: number; tag: number; prompt?: boolean },
    signal?: AbortSignal,
  ) {
    const sym = this.#keys.get(topic);
    if (!sym) throw new Error(`no key for ${topic}`);
    await this.#relay.publish(topic, await encrypt(sym, JSON.stringify(payload)), pubOpts, signal);
  }

  #notifyRequestSent(id: number, topic: string) {
    const href = this.#current?.peer.metadata.redirect?.native ?? this.#current?.peer.metadata.redirect?.universal;
    const url = shouldRedirect(this.#current?.sessionConfig?.disableDeepLink, href)
      ? formatWalletRedirect(href, id, topic)
      : undefined;
    this.#onRequestSent?.({ id, topic, url });
  }

  async #parse(topic: string, message: string): Promise<Json | undefined> {
    const sym = this.#keys.get(topic);
    if (!sym) return;
    try {
      return JSON.parse(await decrypt(sym, message)) as Json;
    } catch {
      log("←", "decrypt failed", { topic });
      return;
    }
  }

  async #onMessage(topic: string, message: string) {
    const msg = await this.#parse(topic, message);
    if (!msg) return;
    await this.#handle(topic, msg);
  }

  async #handle(topic: string, msg: Json) {
    log("←", msg.method ?? (msg.result !== undefined ? "result" : "error"), {
      id: msg.id,
      topic,
      result: msg.result,
      error: msg.error,
    });
    switch (msg.method) {
      case "wc_sessionSettle": {
        if (!msg.params) break;
        const pairingTopic = this.#pairingTopic;
        if (!pairingTopic) return;
        const self = this.#self;
        if (!self) throw new Error("session key is not prepared");
        const params = msg.params as {
          relay: { protocol: string };
          namespaces: Session["namespaces"];
          expiry: number;
          controller: { publicKey: string; metadata: Metadata };
          sessionConfig?: { disableDeepLink?: boolean };
          proposalRequestsResponses?: ProposalRequestsResponses;
        };
        this.#current = {
          topic,
          pairingTopic,
          relay: params.relay,
          expiry: params.expiry,
          namespaces: params.namespaces,
          controller: params.controller.publicKey,
          self: { publicKey: self.publicKey, metadata: this.#metadata },
          peer: { publicKey: params.controller.publicKey, metadata: params.controller.metadata },
          ...(params.sessionConfig ? { sessionConfig: params.sessionConfig } : {}),
          proposalRequestsResponses: params.proposalRequestsResponses,
        };
        this.#fire("persist session", this.#persistSession());
        try {
          await this.#ack(topic, msg.id, this.#ttl.propose, TAG.sessionSettleRes);
        } catch (e) {
          log("i", "settle ack failed", { error: e instanceof Error ? e.message : String(e) });
        }
        this.#onDebug?.({ type: "settle" });
        this.#finishSettle()?.resolve(this.#current);
        return;
      }
      case "wc_sessionPing":
        this.#fire("ack", this.#ack(topic, msg.id, this.#ttl.session, TAG.sessionPingRes));
        return;
      case "wc_sessionEvent": {
        const event = msg.params?.event as { name: string; data: unknown } | undefined;
        const chainId = msg.params?.chainId;
        if (event)
          this.#onEvent?.({
            type: "event",
            name: event.name,
            data: event.data,
            ...(typeof chainId === "string" ? { chainId } : {}),
          });
        return;
      }
      case "wc_sessionUpdate": {
        if (outOfSync(this.#lastUpdateId, msg.id)) return;
        this.#lastUpdateId = msg.id;
        const namespaces = (msg.params as { namespaces: Session["namespaces"] }).namespaces;
        if (this.#current) {
          this.#current = { ...this.#current, namespaces };
          this.#fire("persist session", this.#persistSession());
        }
        this.#fire("ack", this.#ack(topic, msg.id, this.#ttl.session, TAG.sessionUpdateRes));
        this.#onEvent?.({ type: "update", namespaces });
        return;
      }
      case "wc_sessionExtend": {
        if (outOfSync(this.#lastExtendId, msg.id)) return;
        this.#lastExtendId = msg.id;
        const expiry = (msg.params as { expiry: number }).expiry;
        if (this.#current) {
          this.#current = { ...this.#current, expiry };
          this.#fire("persist session", this.#persistSession());
        }
        this.#fire("ack", this.#ack(topic, msg.id, this.#ttl.session, TAG.sessionExtendRes));
        this.#onEvent?.({ type: "extend", expiry });
        return;
      }
      case "wc_sessionDelete": {
        const reason = (msg.params ?? {}) as { code?: number; message?: string };
        this.#failPending(new Error(reason.message ?? "session deleted"));
        this.#fire("clear session", this.#clearSession());
        this.#onEvent?.({ type: "delete", code: reason.code ?? 6000, message: reason.message ?? "User disconnected" });
        return;
      }
    }
    await this.#resolve(msg);
  }

  #ack(topic: string, id: number, ttl: number, tag: number) {
    return this.#pub(topic, { id, jsonrpc: "2.0", result: true }, { ttl, tag });
  }

  async #resolve(msg: Json) {
    if (msg.result && this.#proposalId !== undefined && msg.id === this.#proposalId) {
      const { responderPublicKey } = msg.result as { responderPublicKey: string };
      const self = this.#self;
      if (!self) throw new Error("session key is not prepared");
      const sessionSym = await deriveSymKey(self.privateKey, responderPublicKey);
      const sessionTopic = await hashKey(sessionSym);
      this.#put(sessionTopic, sessionSym);
      await this.#relay.subscribe(sessionTopic);
      return;
    }
    const waiter = this.#pending.get(msg.id);
    if (!waiter) return;
    this.#pending.delete(msg.id);
    if (waiter.timer) clearTimeout(waiter.timer);
    if (msg.error) waiter.reject(Object.assign(new Error(msg.error.message), { code: msg.error.code }));
    else waiter.resolve(msg.result);
  }
}
