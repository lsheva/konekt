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

/** EVM methods proposed to the wallet by the built-in adapter. */
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

/** EVM session events proposed to the wallet by the built-in adapter. */
export const EVENTS = ["chainChanged", "accountsChanged"] as const;

const LOCAL = new Set<string>(["eth_accounts", "eth_requestAccounts"]);

/** Routing rules used after the adapter handles its local account and chain methods. */
export const routes = {
  wallet: new Set<string>(METHODS.filter((m) => !LOCAL.has(m))),
  rpc: /^(eth|net|web3)_/,
} as const;

/** Destination selected for an EVM method. */
export type MethodRoute = "wallet" | "rpc" | "unknown";

/**
 * Classifies an EVM method after local methods have been handled.
 *
 * Known signing, transaction, and chain-switching methods go to the wallet. Other `eth_*`,
 * `net_*`, and `web3_*` methods use the chain's read transport. Everything else is unknown.
 */
export function routeMethod(method: string): MethodRoute {
  if (routes.wallet.has(method)) return "wallet";
  if (routes.rpc.test(method)) return "rpc";
  return "unknown";
}

/** Converts a decimal EVM chain ID to the hexadecimal form required by EIP-1193. */
export const toHexChain = (id: number): Hex => `0x${id.toString(16)}`;

/**
 * Reads the target chain from `wallet_switchEthereumChain` parameters.
 *
 * @returns The decimal chain ID, or `undefined` when the parameters are malformed.
 */
export function parseSwitchChainId(params: unknown): number | undefined {
  if (!Array.isArray(params)) return;
  const head = params[0];
  if (typeof head !== "object" || head === null || !("chainId" in head)) return;
  const { chainId } = head;
  if (typeof chainId !== "string" && typeof chainId !== "number") return;
  const next = typeof chainId === "number" ? chainId : Number.parseInt(chainId, 16);
  return Number.isFinite(next) ? next : undefined;
}

/**
 * Extracts EVM state from an approved session.
 *
 * The first approved EVM account determines the initial chain. Duplicate addresses across approved
 * EVM chains are returned once.
 */
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

/** Properties added to a provider when at least one EVM chain is configured. */
export type EvmExt = {
  /** Active decimal EVM chain ID. */
  chainId: number;
  /** Unique EVM addresses approved in the current session. */
  accounts: string[];
};

/** Optional behavior shared by every chain returned from one {@link evm} call. */
export type EvmOpts = {
  /**
   * JSON-RPC transport for `eth_*`, `net_*`, and `web3_*` reads after wallet methods are routed.
   * `http(url)` from `konekt/http` is the standard transport.
   */
  read?: ((req: RequestArguments) => Promise<unknown>) | undefined;
};

/** An EVM chain that adds {@link EvmExt} properties to its provider. */
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

/** Shared EVM adapter used by chains returned from {@link evm}. */
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

/**
 * Creates EVM `Chain` objects for {@link Provider} configuration.
 *
 * Pass one or more decimal chain IDs and, optionally, an {@link EvmOpts} object last. The same
 * options apply to every returned chain. Use separate calls when networks need different RPC URLs.
 *
 * Do not pass bare numbers to `Provider`'s `chains` option.
 *
 * @example One network without JSON-RPC reads
 * ```ts
 * chains: evm(1)
 * ```
 *
 * @example Two networks with different read transports
 * ```ts
 * chains: [
 *   evm(1, { read: http(ethereumRpcUrl) }),
 *   evm(8453, { read: http(baseRpcUrl) }),
 * ]
 * ```
 *
 * @throws When no numeric chain ID is provided.
 */
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
