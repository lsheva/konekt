import type { Feature } from "konekt";

export function hooks(log: (name: string, value: unknown) => void): Feature {
  return {
    name: "hooks",
    onProposal(p) {
      log("onProposal", Object.keys(p.optionalNamespaces));
      return p;
    },
    onSettle(s) {
      log("onSettle", s.topic);
    },
    onDisconnect() {
      log("onDisconnect", true);
    },
  };
}
