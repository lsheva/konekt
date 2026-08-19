import { type Chain, type ChainAdapter, requireApprovedMethod, resolveChainId } from "../kernel/plugin.ts";

export type ForwardingNamespace = {
  adapter: ChainAdapter;
  chain: (reference: string) => Chain;
};

export type ForwardingNamespaceOptions = {
  namespace: string;
  methods: readonly string[];
  events?: readonly string[] | undefined;
};

/**
 * A namespace whose every declared method goes to the wallet on the resolved chain, and whose
 * declared events surface as EIP-1193 `message`. Everything non-EVM works this way.
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
