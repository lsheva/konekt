import { useState } from "react";
import type { ChainInput, Feature, Provider, RpcRequest, Session } from "konekt";
import { formatError, pretty } from "./format";
import { hooks } from "./hooks";
import { stub } from "./stub";
import { RPC_URL, konektOptions } from "./Wagmi";

type Outcome = { ok: boolean; label: string; value: string };

const LAB_ACCOUNT = "eip155:1:0x0000000000000000000000000000000000000001";

function labSession(namespaces: Session["namespaces"], onForward: (req: RpcRequest) => void) {
  const session: Session = {
    topic: "lab-topic",
    pairingTopic: "lab-pairing",
    relay: { protocol: "irn" },
    expiry: 0,
    namespaces,
    controller: "lab",
    self: { publicKey: "self", metadata: konektOptions.metadata },
    peer: { publicKey: "peer", metadata: konektOptions.metadata },
  };
  return {
    uri: undefined as string | undefined,
    session,
    connect: async () => session,
    restore: async () => false,
    request: async (req: RpcRequest) => {
      onForward(req);
      return { forwarded: true, method: req.method, chainId: req.chainId };
    },
    disconnect: async () => {},
  };
}

export const Seams: React.FC = () => {
  const [evmOn, setEvmOn] = useState(true);
  const [httpOn, setHttpOn] = useState(false);
  const [solanaOn, setSolanaOn] = useState(false);
  const [bitcoinOn, setBitcoinOn] = useState(false);
  const [stubOn, setStubOn] = useState(true);
  const [hooksOn, setHooksOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<string[]>([]);
  const [provider, setProvider] = useState<Provider>();
  const [hasChainId, setHasChainId] = useState<boolean>();
  const [forwarded, setForwarded] = useState<RpcRequest[]>([]);
  const [hookLog, setHookLog] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<Outcome>();

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const value = await fn();
      setOutcome({ ok: true, label, value: pretty(value) });
    } catch (e) {
      setOutcome({ ok: false, label, value: formatError(e) });
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!evmOn && !solanaOn && !bitcoinOn && !stubOn) return;
    setBusy(true);
    try {
      await provider?.disconnect().catch(() => {});
      const modules: string[] = ["konekt"];
      const chains: ChainInput[] = [];
      const features: Feature[] = [];
      setForwarded([]);
      setHookLog([]);

      if (evmOn) {
        const { ethereumMainnet, evm } = await import("konekt/eip155");
        modules.push("konekt/eip155");
        if (httpOn) {
          const { http } = await import("konekt/http");
          modules.push("konekt/http");
          chains.push(evm(1, { read: http(RPC_URL) }));
        } else {
          chains.push(ethereumMainnet);
        }
      }
      if (stubOn) chains.push(stub());
      if (solanaOn) {
        const { solanaMainnet } = await import("konekt/solana");
        modules.push("konekt/solana");
        chains.push(solanaMainnet);
      }
      if (bitcoinOn) {
        const { bitcoinMainnet } = await import("konekt/bip122");
        modules.push("konekt/bip122");
        chains.push(bitcoinMainnet);
      }
      if (hooksOn) {
        features.push(hooks((name, value) => setHookLog((prev) => [...prev, `${name} ${pretty(value)}`])));
      }

      const namespaces: Session["namespaces"] = {};
      if (evmOn) namespaces.eip155 = { accounts: [LAB_ACCOUNT], methods: ["personal_sign"], events: [] };
      if (solanaOn) {
        namespaces.solana = {
          accounts: ["solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:So11111111111111111111111111111111111111112"],
          methods: ["solana_signMessage"],
          events: [],
        };
      }
      if (bitcoinOn) {
        namespaces.bip122 = {
          accounts: ["bip122:000000000019d6689c085ae165831e93:bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"],
          methods: ["sendTransfer"],
          events: ["bip122_addressesChanged"],
        };
      }
      if (stubOn) namespaces.stub = { accounts: ["stub:1:lab"], methods: ["stub_echo"], events: [] };

      const { Provider } = await import("konekt");
      const next = await Provider.create(
        {
          projectId: konektOptions.projectId,
          metadata: konektOptions.metadata,
          chains,
          features,
        },
        { session: labSession(namespaces, (req) => setForwarded((prev) => [...prev, req])) },
      );
      await next.connect();
      setProvider(next);
      setLoaded(modules);
      setHasChainId("chainId" in next);
      setOutcome({ ok: true, label: "create", value: `loaded ${modules.join(", ")}` });
    } catch (e) {
      setOutcome({ ok: false, label: "create", value: formatError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h2>Seams</h2>
      <p className="status">
        Isolated Provider.create — pick modules, then load them. No pairing. The kernel never imports EVM or HTTP.
      </p>
      <div className="row" style={{ marginTop: 10 }}>
        <label className="chip">
          <input type="checkbox" checked={evmOn} onChange={(e) => setEvmOn(e.target.checked)} />
          konekt/eip155
        </label>
        <label className="chip">
          <input
            type="checkbox"
            checked={httpOn}
            disabled={!evmOn}
            onChange={(e) => setHttpOn(e.target.checked)}
          />
          konekt/http
        </label>
        <label className="chip">
          <input type="checkbox" checked={solanaOn} onChange={(e) => setSolanaOn(e.target.checked)} />
          konekt/solana
        </label>
        <label className="chip">
          <input type="checkbox" checked={bitcoinOn} onChange={(e) => setBitcoinOn(e.target.checked)} />
          konekt/bip122
        </label>
        <label className="chip">
          <input type="checkbox" checked={stubOn} onChange={(e) => setStubOn(e.target.checked)} />
          stub adapter
        </label>
        <label className="chip">
          <input type="checkbox" checked={hooksOn} onChange={(e) => setHooksOn(e.target.checked)} />
          hooks feature
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn primary" disabled={busy || (!evmOn && !solanaOn && !bitcoinOn && !stubOn)} onClick={() => void create()}>
          Load selected
        </button>
        <button
          className="btn ghost"
          disabled={busy || !provider}
          onClick={() =>
            run("disconnect", async () => {
              await provider?.disconnect();
              return "disconnected";
            })
          }
        >
          disconnect → onDisconnect
        </button>
      </div>
      {loaded.length > 0 && (
        <p className="status" style={{ marginTop: 10 }}>
          imported {loaded.join(" · ")} · chainId property {hasChainId ? "present" : "absent"}
        </p>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="btn method"
          disabled={busy || !provider}
          onClick={() => run("eth_chainId", () => provider!.request({ method: "eth_chainId" }))}
        >
          <code>eth_chainId</code>
          <span>local if eip155 loaded</span>
        </button>
        <button
          className="btn method"
          disabled={busy || !provider}
          onClick={() => run("eth_accounts", () => provider!.request({ method: "eth_accounts" }))}
        >
          <code>eth_accounts</code>
          <span>session accounts</span>
        </button>
        <button
          className="btn method"
          disabled={busy || !provider}
          onClick={() => run("eth_blockNumber", () => provider!.request({ method: "eth_blockNumber" }))}
        >
          <code>eth_blockNumber</code>
          <span>4200 until http is loaded</span>
        </button>
        <button
          className="btn method"
          disabled={busy || !provider}
          onClick={() =>
            run("personal_sign", () => provider!.request({ method: "personal_sign", params: ["0x6869", "0x1"] }))
          }
        >
          <code>personal_sign</code>
          <span>forwarded if eip155</span>
        </button>
        <button
          className="btn method"
          disabled={busy || !provider}
          onClick={() => run("stub_echo", () => provider!.request({ method: "stub_echo" }))}
        >
          <code>stub_echo</code>
          <span>stub namespace only</span>
        </button>
        <button
          className="btn method"
          disabled={busy || !provider}
          onClick={() =>
            run("solana_signMessage", () =>
              provider!.request({ method: "solana_signMessage", params: { message: "hi", pubkey: "So111" } }),
            )
          }
        >
          <code>solana_signMessage</code>
          <span>forwarded if solana loaded</span>
        </button>
        <button
          className="btn method"
          disabled={busy || !provider}
          onClick={() =>
            run("sendTransfer", () =>
              provider!.request({
                method: "sendTransfer",
                params: { account: "bc1q", recipientAddress: "bc1q", amount: "1" },
              }),
            )
          }
        >
          <code>sendTransfer</code>
          <span>forwarded if bip122 loaded</span>
        </button>
      </div>
      {outcome && (
        <pre className={`pre ${outcome.ok ? "ok" : "err"}`} style={{ marginTop: 12 }}>
          {outcome.label}
          {"\n"}
          {outcome.value}
        </pre>
      )}
      {forwarded.length > 0 && (
        <p className="mono" style={{ fontSize: 12, marginTop: 8 }}>
          forwarded {forwarded.map((r) => `${r.chainId}:${r.method}`).join(" · ")}
        </p>
      )}
      {hookLog.length > 0 && (
        <p className="status" style={{ marginTop: 8 }}>
          hooks {hookLog.join(" · ")}
        </p>
      )}
    </section>
  );
};
