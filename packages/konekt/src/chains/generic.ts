import { type Chain, type ChainAdapter, requireApprovedMethod, resolveChainId } from "../kernel/plugin.ts";

/** Adapter and chain factory returned by {@link forwardingNamespace}. */
export type ForwardingNamespace = {
  /** Shared adapter to use for every chain in this namespace. */
  adapter: ChainAdapter;
  /** Creates a chain from the namespace-specific CAIP-2 reference. */
  chain: (reference: string) => Chain;
};

/** Description of a WalletConnect namespace whose supported methods all go to the wallet. */
export type ForwardingNamespaceOptions = {
  /** CAIP-2 namespace, without a chain reference or colon. */
  namespace: string;
  /** JSON-RPC methods to propose and forward. */
  methods: readonly string[];
  /** Session events to propose and expose through the provider's `message` event. */
  events?: readonly string[] | undefined;
};

/**
 * Creates an adapter and chain factory for a forwarding-only namespace.
 *
 * Every declared method goes to the wallet on the explicitly targeted, active, or first configured
 * chain. Declared session events are emitted as EIP-1193 `message` events with `{ type, data }`.
 *
 * @example
 * ```ts
 * const { chain } = forwardingNamespace({
 *   namespace: "example",
 *   methods: ["example_signMessage"],
 *   events: ["example_accountsChanged"],
 * });
 *
 * const exampleMainnet = chain("mainnet");
 * ```
 */
export function forwardingNamespace({
  namespace,
  methods,
  events = [],
}: ForwardingNamespaceOptions): ForwardingNamespace {
  const methodSet = new Set<string>(methods);
  const eventSet = new Set<string>(events);

  const adapter: ChainAdapter = {
    namespace,
    methods: [...methods],
    events: [...events],
    handle(req, ctx) {
      if (!methodSet.has(req.method)) return;
      const chainId = resolveChainId(req, ctx, namespace);
      if (!chainId) return;
      requireApprovedMethod(ctx, namespace, req.method);
      return ctx.forward({ ...req, chainId });
    },
    onEvent(name, data, _chainId, ctx) {
      if (eventSet.has(name)) ctx.emit("message", { type: name, data });
    },
  };

  return {
    adapter,
    chain(reference) {
      if (!reference) throw new Error("UNSUPPORTED_CHAINS");
      return { namespace, id: `${namespace}:${reference}`, adapter };
    },
  };
}
