import {
  type Chain,
  type ChainAdapter,
  type Ctx,
  type RpcRequest,
  requireApprovedMethod,
  resolveChainId,
} from "../kernel/plugin.ts";
import {
  type Hex,
  ProviderRpcError,
  parseCaipAccount,
  type RequestArguments,
  RpcErrorCode,
  type Session,
} from "../kernel/types.ts";

export const METHODS = [
  "eth_sendTransaction",
  "personal_sign",
  "eth_sign",
  "eth_signTransaction",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "eth_accounts",
  "eth_requestAccounts",
  "wallet_switchEthereumChain",
] as const;

export const EVENTS = ["chainChanged", "accountsChanged"] as const;

const LOCAL = new Set<string>(["eth_accounts", "eth_requestAccounts"]);

export const routes = {
  wallet: new Set<string>(METHODS.filter((m) => !LOCAL.has(m))),
  rpc: /^(eth|net|web3)_/,
} as const;

export type MethodRoute = "wallet" | "rpc" | "unknown";

export function routeMethod(method: string): MethodRoute {
  if (routes.wallet.has(method)) return "wallet";
  if (routes.rpc.test(method)) return "rpc";
  return "unknown";
}

export const toHexChain = (id: number): Hex => `0x${id.toString(16)}`;

export function parseSwitchChainId(params: unknown): number | undefined {
  if (!Array.isArray(params)) return;
  const head = params[0];
  if (typeof head !== "object" || head === null || !("chainId" in head)) return;
  const { chainId } = head;
  if (typeof chainId !== "string" && typeof chainId !== "number") return;
  const next = typeof chainId === "number" ? chainId : Number.parseInt(chainId, 16);
  return Number.isFinite(next) ? next : undefined;
}

export function parseAccounts(session: { namespaces: Session["namespaces"] } | undefined): {
  chainId: number;
  accounts: string[];
} {
  const parsed: { chainId: number; address: string }[] = [];
  for (const a of session?.namespaces.eip155?.accounts ?? []) {
    const account = parseCaipAccount(a);
    if (!account) continue;
    parsed.push({ chainId: Number(account.chainId.split(":")[1]), address: account.address });
  }
  const first = parsed[0];
  if (!first) return { chainId: 0, accounts: [] };
  return { chainId: first.chainId, accounts: [...new Set(parsed.map((p) => p.address))] };
}

export type EvmExt = {
  chainId: number;
  accounts: string[];
};

export type EvmOpts = {
  read?: ((req: RequestArguments) => Promise<unknown>) | undefined;
};

export type EvmChain = Chain<EvmExt>;

function chainIdOf(ctx: Ctx): number {
  const active = ctx.activeChainId("eip155");
  if (active) return Number(active.split(":")[1]);
  return parseAccounts(ctx.session()).chainId;
}

function unauthorized(method: string) {
  return new ProviderRpcError(RpcErrorCode.unauthorized, `No session. Call connect() before ${method}.`);
}

function handle(req: RpcRequest, ctx: Ctx): Promise<unknown> | unknown {
  switch (req.method) {
    case "eth_chainId":
      return toHexChain(chainIdOf(ctx));
    case "eth_accounts":
    case "eth_requestAccounts":
      if (!ctx.session()) throw unauthorized(req.method);
      return parseAccounts(ctx.session()).accounts;
    case "wallet_switchEthereumChain": {
      const next = parseSwitchChainId(req.params);
      if (next === undefined) throw new ProviderRpcError(RpcErrorCode.invalidParams, "Invalid params");
      const approved = ctx.session()?.namespaces.eip155?.accounts?.some((a) => a.startsWith(`eip155:${next}:`));
      if (approved) {
        ctx.setActiveChainId("eip155", `eip155:${next}`);
        ctx.emit("chainChanged", toHexChain(next));
        return null;
      }
      if (!ctx.session()) throw unauthorized(req.method);
      requireApprovedMethod(ctx, "eip155", req.method);
      return ctx.forward({ ...req, chainId: `eip155:${chainIdOf(ctx)}` });
    }
  }
  switch (routeMethod(req.method)) {
    case "wallet": {
      if (!ctx.session()) throw unauthorized(req.method);
      requireApprovedMethod(ctx, "eip155", req.method);
      return ctx.forward({ ...req, chainId: resolveChainId(req, ctx, "eip155") ?? `eip155:${chainIdOf(ctx)}` });
    }
    case "rpc": {
      const id = resolveChainId(req, ctx, "eip155");
      const chain = ctx.chains.find((c) => c.id === id) ?? ctx.chains.find((c) => c.namespace === "eip155");
      const read = chain?.read;
      if (!read) {
        throw new ProviderRpcError(
          RpcErrorCode.unsupportedMethod,
          `JSON-RPC read "${req.method}" is unsupported because no read transport was provided.`,
        );
      }
      return read({ method: req.method, params: req.params });
    }
    default:
      return;
  }
}

function onEvent(name: string, data: unknown, _chainId: string | undefined, ctx: Ctx) {
  if (name === "chainChanged") {
    const next = Number(data);
    if (Number.isFinite(next) && next > 0) ctx.setActiveChainId("eip155", `eip155:${next}`);
    ctx.emit("chainChanged", (typeof data === "string" ? data : toHexChain(next)) as Hex);
    return;
  }
  if (name === "accountsChanged") {
    ctx.emit("accountsChanged", data);
    return;
  }
  if (name === "session_update") {
    const parsed = parseAccounts({ namespaces: data as Session["namespaces"] });
    ctx.emit("accountsChanged", parsed.accounts);
    ctx.emit("chainChanged", toHexChain(chainIdOf(ctx)));
  }
}

export const evmAdapter: ChainAdapter<EvmExt> = {
  namespace: "eip155",
  methods: [...METHODS],
  events: [...EVENTS],
  handle,
  extend(ctx) {
    return {
      get chainId() {
        return chainIdOf(ctx);
      },
      get accounts() {
        return parseAccounts(ctx.session()).accounts;
      },
    };
  },
  onSettle(session, ctx) {
    const parsed = parseAccounts(session);
    if (parsed.chainId) ctx.setActiveChainId("eip155", `eip155:${parsed.chainId}`);
  },
  onEvent,
};

export function evm(...args: Array<number | EvmOpts>): EvmChain[] {
  const ids: number[] = [];
  let opts: EvmOpts = {};
  for (const arg of args) {
    if (typeof arg === "number") ids.push(arg);
    else opts = arg;
  }
  if (!ids.length) throw new Error("UNSUPPORTED_CHAINS");
  return ids.map((id) => ({
    namespace: "eip155",
    id: `eip155:${id}`,
    adapter: evmAdapter,
    read: opts.read,
  }));
}
