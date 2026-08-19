import type { Chain, ChainAdapter } from "konekt";

export function stub(id = "stub:1"): Chain {
  const adapter: ChainAdapter = {
    namespace: "stub",
    methods: ["stub_echo"],
    events: [],
    handle(req, ctx) {
      if (req.method !== "stub_echo") return;
      return ctx.forward({ ...req, chainId: id });
    },
  };
  return { namespace: "stub", id, adapter };
}
