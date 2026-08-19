import { toHex } from "./bytes.ts";
import { hashMessage } from "./crypto.ts";
import { type DebugEvent, log, type OnDebug } from "./debug.ts";
import { createDedupe } from "./dedupe.ts";
import { signJwt } from "./jwt.ts";

type PublishOpts = { ttl: number; tag: number; prompt?: boolean };

type Rpc = {
  id?: number | string;
  jsonrpc?: string;
  method?: string;
  params?: { data?: { topic: string; message: string } };
  result?: unknown;
  error?: { message?: string };
};

type Stored = { topic: string; message: string };
type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  finish: () => void;
};

const RPC_TIMEOUT_MS = 15_000;
const CONNECT_TIMEOUT_MS = 10_000;
const RECONNECT_MS = 5_000;
const CLOSE_GRACE_MS = 1_000;

/** WalletConnect relays reject small ids; they expect a 19-digit timestamp bigint. */
let rpcExtra = 1;
const rpcSeed = crypto.getRandomValues(new Uint16Array(1))[0] ?? 0;
const nextRpcId = () => (BigInt(Date.now()) * 1_000_000n + BigInt(rpcSeed + rpcExtra++)).toString();
const rawId = (raw: string) => raw.match(/"id"\s*:\s*(\d+)/)?.[1];
const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

function unref(timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>) {
  if (typeof timer === "object" && timer !== null && "unref" in timer && typeof timer.unref === "function") {
    timer.unref();
  }
}

function abortError(signal?: AbortSignal) {
  if (signal?.reason instanceof Error) return signal.reason;
  return new DOMException("Aborted", "AbortError");
}

export class RelayClient {
  #url: string;
  #onDebug: OnDebug | undefined;
  #ws: WebSocket | undefined;
  #userClosed = false;
  #fatal = false;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #pulse: ReturnType<typeof setInterval> | undefined;
  #topics = new Set<string>();
  #accept = createDedupe();
  #pending = new Map<string, Pending>();
  #handlers: Array<(topic: string, message: string) => void> = [];

  constructor(url: string, onDebug?: OnDebug) {
    this.#url = url;
    this.#onDebug = onDebug;
  }

  #emit(e: DebugEvent) {
    this.#onDebug?.(e);
  }

  #dispatch(topic: string, message: string) {
    if (!this.#accept(hashMessage(`${topic}:${message}`))) return;
    this.#emit({ type: "inbound", topic });
    for (const fn of this.#handlers) fn(topic, message);
  }

  #send(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const socket = this.#ws;
    if (this.#userClosed || !socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("relay closed"));
    }
    if (signal?.aborted) return Promise.reject(abortError(signal));
    const id = nextRpcId();
    log("→", `${method} #${id}`, params);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.#pending.delete(id)) {
          finish();
          log("←", `${method} #${id} timeout`);
          reject(new Error(`relay timeout: ${method}`));
        }
      }, RPC_TIMEOUT_MS);
      unref(timer);

      const onAbort = () => {
        if (this.#pending.delete(id)) {
          finish();
          log("←", `${method} #${id} aborted`);
          reject(abortError(signal));
        }
      };
      const finish = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      };

      this.#pending.set(id, { resolve, reject, finish });
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      socket.send(`{"id":${id},"jsonrpc":"2.0","method":${JSON.stringify(method)},"params":${JSON.stringify(params)}}`);
    });
  }

  #onData(raw: string) {
    const id = rawId(raw);
    const msg = JSON.parse(raw) as Rpc;
    if (msg.method?.endsWith("_subscription")) {
      const { topic, message } = msg.params?.data ?? {};
      log("←", msg.method, { id, topic, message });
      if (topic && message) this.#dispatch(topic, message);
      if (id !== undefined) {
        log("→", `ack #${id}`);
        this.#ws?.send(`{"id":${id},"jsonrpc":"2.0","result":true}`);
      }
      return;
    }
    if (id === undefined) {
      log("←", "event", msg);
      return;
    }
    const p = this.#pending.get(id);
    if (!p) {
      log("←", `unmatched #${id}`, msg);
      return;
    }
    this.#pending.delete(id);
    p.finish();
    if (msg.error) {
      log("←", `#${id} error`, msg.error);
      p.reject(new Error(msg.error.message ?? "relay error"));
    } else {
      log("←", `#${id} result`, msg.result);
      p.resolve(msg.result);
    }
  }

  #failPending(err: Error) {
    for (const [, p] of this.#pending) {
      p.finish();
      p.reject(err);
    }
    this.#pending.clear();
  }

  async #resubscribe() {
    for (const topic of this.#topics) {
      await this.#send("irn_subscribe", { topic });
    }
    await this.#fetchMessages([...this.#topics]);
  }

  #clearRetry() {
    if (this.#retry) clearTimeout(this.#retry);
    this.#retry = undefined;
  }

  #scheduleReconnect() {
    if (this.#userClosed || this.#fatal || this.#retry) return;
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      if (this.#userClosed || this.#fatal || !visible()) return;
      void this.connect().catch((e) => this.#emit({ type: "error", error: (e as Error).message }));
    }, RECONNECT_MS);
    unref(this.#retry);
  }

  #onSocketClose(e: { code: number; reason: string }) {
    log("i", "socket close", e);
    this.#emit({ type: "socket_close", code: e.code, reason: e.reason });
    this.#ws = undefined;
    this.#failPending(new Error("relay closed"));
    if (e.code === 3000) {
      this.#fatal = true;
      this.#emit({ type: "error", error: "relay rejected auth" });
      return;
    }
    if (!this.#userClosed) this.#scheduleReconnect();
  }

  async connect() {
    if (this.#userClosed) return;
    if (this.#ws?.readyState === WebSocket.OPEN) return;
    if (this.#fatal) throw new Error("relay rejected auth");
    const socket = new WebSocket(this.#url);
    this.#ws = socket;
    log("i", "connect", { host: new URL(this.#url).host });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("relay connect timeout")), CONNECT_TIMEOUT_MS);
      unref(timer);
      const done = (fn: () => void) => {
        clearTimeout(timer);
        fn();
      };
      socket.addEventListener("open", () => {
        log("i", "socket open");
        this.#emit({ type: "socket_open" });
        done(resolve);
      });
      socket.addEventListener("error", () => done(() => reject(new Error("relay socket error"))));
      socket.addEventListener("close", (e) => {
        if (e.code === 3000) done(() => reject(new Error("relay rejected auth")));
        this.#onSocketClose({ code: e.code, reason: String(e.reason) });
      });
    });
    if (this.#userClosed) {
      socket.close();
      return;
    }
    socket.addEventListener("message", (e) => this.#onData(String(e.data)));
    await this.#resubscribe();
    if (this.#userClosed) return;
    if (!this.#pulse) {
      this.#pulse = setInterval(() => {
        if (this.#userClosed || this.#fatal || !visible()) return;
        if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) this.#scheduleReconnect();
      }, RECONNECT_MS);
      unref(this.#pulse);
      if (typeof window !== "undefined") {
        window.addEventListener("online", () => this.#scheduleReconnect());
        document.addEventListener("visibilitychange", () => {
          if (visible()) this.#scheduleReconnect();
        });
      }
    }
  }

  drop() {
    this.#ws?.close();
  }

  close() {
    this.#userClosed = true;
    this.#clearRetry();
    if (this.#pulse) clearInterval(this.#pulse);
    this.#pulse = undefined;
    const socket = this.#ws;
    this.#ws = undefined;
    this.#failPending(new Error("relay closed"));
    if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, CLOSE_GRACE_MS);
      socket.addEventListener(
        "close",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.close();
    });
  }

  async subscribe(topic: string) {
    this.#topics.add(topic);
    await this.#send("irn_subscribe", { topic });
    await this.#fetchMessages([topic]);
  }

  async publish(topic: string, message: string, opts: PublishOpts, signal?: AbortSignal) {
    this.#emit({ type: "publish", topic, tag: opts.tag });
    await this.#send(
      "irn_publish",
      { topic, message, ttl: opts.ttl, tag: opts.tag, prompt: opts.prompt ?? false },
      signal,
    );
  }

  async proposeSession(pairingTopic: string, sessionProposal: string, ttl: number) {
    this.#topics.add(pairingTopic);
    await this.#send("wc_proposeSession", { pairingTopic, sessionProposal, ttl });
    await this.#fetchMessages([pairingTopic]);
  }

  async #fetchMessages(list: string[]) {
    if (!list.length) return;
    try {
      const result = (await this.#send("irn_batchFetchMessages", { topics: list })) as
        | { messages?: Stored[] }
        | undefined;
      for (const m of result?.messages ?? []) {
        if (m.topic && m.message) this.#dispatch(m.topic, m.message);
      }
    } catch {
      // Some relays omit history; live subscriptions still apply.
    }
  }

  onMessage(fn: (topic: string, message: string) => void) {
    this.#handlers.push(fn);
  }
}

export const relays = new WeakMap<object, RelayClient>();

export function formatRelayUrl(base: string, auth: string, projectId: string): string {
  const u = new URL(base);
  u.searchParams.set("auth", auth);
  u.searchParams.set("projectId", projectId);
  u.searchParams.set("ua", "wc-2/js-2.23.10/node-unknown/node");
  u.searchParams.set("useOnCloseEvent", "true");
  return u.toString();
}

export const DEFAULT_RELAY_URL = "wss://relay.walletconnect.org";

export function openRelay(opts: {
  projectId: string;
  seed: Uint8Array;
  url?: string | undefined;
  onDebug?: OnDebug | undefined;
}): RelayClient {
  const url = opts.url ?? DEFAULT_RELAY_URL;
  return new RelayClient(formatRelayUrl(url, signJwt(toHex(opts.seed), url, opts.seed), opts.projectId), opts.onDebug);
}
