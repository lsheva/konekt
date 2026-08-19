import { useCallback, useEffect, useState } from "react";
import { formatUnits, numberToHex, parseEther } from "viem";
import {
  formatWalletRedirect,
  memoryStorage,
  type Provider,
  type ProviderEvents,
  RpcErrorCode,
  TTL,
} from "konekt";
import { checkClaims, formatCacaoMessage, verifyCacao } from "konekt/cacao";
import type { EvmExt } from "konekt/eip155";
import { cacaosOf } from "konekt/siwe";
import { useBalance, useChains, usePublicClient } from "wagmi";
import { useProviderPairing, WalletModal } from "konekt-ui";
import { evmAddresses, firstAddress } from "./accounts";
import { debugBus } from "./debugBus";
import { ethSignHash, explorers, formatError, mailTypedData, pretty, utf8Hex } from "./format";
import { missingNamespace, openProvider, type PairKind, restoreProvider, siweChallenge } from "./pair";
import { Seams } from "./Seams";
import { RPC_URL, konektOptions } from "./Wagmi";

const SAMPLE = "konekt showcase";
/** Minimal well-formed StdSignDoc: a no-op with an empty message list, so nothing is broadcastable. */
const aminoSignDoc = (signer: string, chainId: string) => ({
  chain_id: chainId,
  account_number: "0",
  sequence: "0",
  fee: { amount: [], gas: "0" },
  msgs: [],
  memo: `${SAMPLE} from ${signer.slice(0, 12)}...`,
});

const KINDS = ["evm", "solana", "bitcoin", "cosmos"] as const;
const PAIR_LABELS: Record<PairKind, string> = {
  evm: "EVM",
  solana: "Solana",
  bitcoin: "Bitcoin",
  cosmos: "Cosmos",
};
const SOLANA_MESSAGE = "37u9WtQpcm6ULa3VtWDFAWoQc1hUvybPrA3dtx99tgHvvcE7pKRZjuGmn7VX2tC3JmYDYGG7";
type EvmProvider = Provider & EvmExt;

type Outcome = { ok: boolean; label: string; value: string };
type LogItem = { t: string; name: string; value: string };

function stamp() {
  return new Date().toISOString().slice(11, 23);
}

export const Showcase: React.FC = () => {
  const chains = useChains();
  const publicClient = usePublicClient();

  const [kinds, setKinds] = useState<PairKind[]>(["evm"]);
  const [authenticate, setAuthenticate] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [pairError, setPairError] = useState<string>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>();
  const [sessionTick, setSessionTick] = useState(0);
  const [busy, setBusy] = useState<string>();
  const [outcome, setOutcome] = useState<Outcome>();
  const [log, setLog] = useState<LogItem[]>([]);
  const [amount, setAmount] = useState("0");
  const [to, setTo] = useState("");
  const [redirectHref, setRedirectHref] = useState("https://wallet.example/app");
  const [requestSent, setRequestSent] = useState<ProviderEvents["request_sent"]>();

  const session = provider?.session;
  const evm = provider && "chainId" in provider ? (provider as EvmProvider) : undefined;
  const address = evmAddresses(session)[0];
  const chainId = evm?.chainId;
  const solanaPubkey = firstAddress(session, "solana");
  const bitcoinAccount = firstAddress(session, "bip122");
  const cosmosAccount = firstAddress(session, "cosmos");
  const connected = !!session;
  const balance = useBalance({ address });
  const pairing = useProviderPairing(provider);

  const push = useCallback((name: string, value: unknown) => {
    setLog((prev) => [{ t: stamp(), name, value: pretty(value) }, ...prev].slice(0, 40));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void restoreProvider().then(
      (p) => {
        if (cancelled) return;
        setRestoring(false);
        if (p) setProvider(p);
      },
      (e) => {
        if (cancelled) return;
        setRestoring(false);
        setPairError(formatError(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!provider) return;
    const unsubs: Array<() => void> = [];
    const add = <K extends keyof ProviderEvents>(name: K) => {
      const fn = (payload: ProviderEvents[K]) => {
        if (name === "request_sent") {
          const e = payload as ProviderEvents["request_sent"];
          setRequestSent(e);
          if (e.url && window.matchMedia("(pointer: coarse)").matches) window.location.assign(e.url);
        }
        if (name === "connect" || name === "disconnect" || name === "accountsChanged" || name === "chainChanged") {
          setSessionTick((n) => n + 1);
        }
        if (name === "connect") setPairError(missingNamespace(kinds, provider.session));
        push(name, payload);
      };
      provider.on(name, fn);
      unsubs.push(() => provider.removeListener(name, fn));
    };
    add("display_uri");
    add("request_sent");
    add("connect");
    add("disconnect");
    add("accountsChanged");
    add("chainChanged");
    add("message");
    const onceConnect = (payload: ProviderEvents["connect"]) => push("once:connect", payload);
    provider.once("connect", onceConnect);
    unsubs.push(() => provider.off("connect", onceConnect));
    unsubs.push(debugBus.subscribe((e) => push(`debug:${e.type}`, e)));
    return () => {
      for (const u of unsubs) u();
    };
  }, [provider, push, kinds]);

  useEffect(() => {
    if (address && !to) setTo(address);
  }, [address, to]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      const value = await fn();
      const text = pretty(value);
      setOutcome({ ok: true, label, value: text });
      push(label, value);
    } catch (e) {
      const text = formatError(e);
      setOutcome({ ok: false, label, value: text });
      push(`${label}:error`, text);
    } finally {
      setBusy(undefined);
    }
  };

  const requireProvider = () => {
    if (!provider) throw new Error("Provider is not ready.");
    return provider;
  };

  const requireAccount = () => {
    const p = requireProvider();
    if (!address || chainId === undefined) throw new Error("No account.");
    return { provider: p, address, chainId };
  };

  /** Rebuilt from KINDS so the selection keeps a stable order regardless of click order. */
  const toggleKind = (value: PairKind) =>
    setKinds((prev) => KINDS.filter((k) => (k === value ? !prev.includes(k) : prev.includes(k))));

  const cacaos = cacaosOf(session);

  /** What a backend would do with the CACAO. Runs here only to make the check visible. */
  const verifySignIn = async () => {
    const expected = siweChallenge();
    if (!expected) throw new Error("This session did not request authentication.");
    return Promise.all(
      cacaos.map(async (cacao) => ({
        iss: cacao.p.iss,
        signature: await verifyCacao(cacao),
        claims: checkClaims(cacao.p, expected),
        signed: formatCacaoMessage(cacao.p),
      })),
    );
  };

  /** The modal drives connect(): it owns the AbortSignal, so closing it cancels the pairing. */
  const connectWallet = async () => {
    setConnecting(true);
    setPairError(undefined);
    try {
      await provider?.disconnect().catch(() => {});
      setProvider(await openProvider(kinds, { authenticate }));
      setPickerOpen(true);
    } catch (e) {
      setPairError(formatError(e));
    } finally {
      setConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    setConnecting(true);
    try {
      await provider?.disconnect();
      setRequestSent(undefined);
      setSessionTick((n) => n + 1);
    } finally {
      setConnecting(false);
    }
  };

  const tx = () => ({
    from: address,
    to: (to || address) as `0x${string}`,
    value: numberToHex(parseEther(amount || "0")),
    data: "0x" as const,
  });

  const redirect = session?.peer.metadata.redirect;
  const href = redirect?.universal ?? redirect?.native;
  const builtRedirect =
    requestSent && href ? formatWalletRedirect(href, requestSent.id, requestSent.topic) : undefined;
  const explorer = chainId ? explorers[chainId] : undefined;

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <div className="badge">EIP-1193 · Solana · Bitcoin · WalletConnect v2</div>
          <h1>konekt showcase</h1>
          <p>
            Pair one namespace at a time. EVM wallets drop Bitcoin; injected Xverse/Leather/UniSat
            sessions are not WalletConnect QR.
          </p>
        </div>
        <div className="status">
          {restoring && "Restoring session…"}
          {connecting && "Waiting for wallet…"}
          {connected && provider?.isWalletConnect && "isWalletConnect"}
        </div>
      </header>

      <div className="grid">
        <div className="stack">
          <section className="card">
            <h2>Pairing</h2>
            <p className="status">
              Tick several to propose them in one session. Every namespace is optional, so a wallet may settle a
              session covering only some of them. Bitcoin proposes mainnet only. Trust rejects testnet and signet with
              “chains are not supported yet.”
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              {KINDS.map((value) => (
                <label className="chip" key={value}>
                  <input
                    type="checkbox"
                    name="pair-kind"
                    checked={kinds.includes(value)}
                    disabled={connecting || connected}
                    onChange={() => toggleKind(value)}
                  />
                  {PAIR_LABELS[value]}
                </label>
              ))}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <label className="chip">
                <input
                  type="checkbox"
                  checked={authenticate}
                  disabled={connecting || connected || !kinds.includes("evm")}
                  onChange={() => setAuthenticate((on) => !on)}
                />
                Sign in (one-click auth)
              </label>
              <span className="status">
                Adds <code>requests.authentication</code> to the proposal. Undocumented in the specs, so most wallets
                are expected to ignore it and settle a plain session.
              </span>
            </div>
            {!connected && (
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  className="btn primary"
                  disabled={connecting || restoring || !kinds.length}
                  onClick={() => void connectWallet()}
                >
                  {kinds.length > 1 ? `Connect ${kinds.length} namespaces` : "Connect"}
                </button>
                <span className="status">Closing the modal aborts connect(signal).</span>
              </div>
            )}
            {pairError && <p className="status">{pairError}</p>}
            <WalletModal
              open={pickerOpen}
              projectId={konektOptions.projectId}
              pairing={pairing}
              onClose={() => setPickerOpen(false)}
            />
            {connected && (
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn danger" disabled={connecting} onClick={() => void disconnectWallet()}>
                  Disconnect
                </button>
              </div>
            )}
          </section>

          <Seams />

          {requestSent && (
            <section className="card">
              <h2>request_sent</h2>
              <div className="banner">
                <div>
                  <div>
                    id {requestSent.id} · topic {requestSent.topic.slice(0, 10)}…
                  </div>
                  <div className="status">{requestSent.url ?? "wallet did not advertise a redirect URL"}</div>
                </div>
                {requestSent.url && (
                  <a className="btn primary" href={requestSent.url}>
                    Open wallet
                  </a>
                )}
              </div>
            </section>
          )}

          <section className="card" data-tick={sessionTick}>
            {session ? (
              <>
                <div className="peer">
                  {session.peer.metadata.icons[0] && (
                    <img src={session.peer.metadata.icons[0]} alt="" />
                  )}
                  <div>
                    {session.peer.metadata.name}
                    {address ? ` · ${address}` : ""}
                    <div className="status">
                      {address && balance.data
                        ? `${formatUnits(balance.data.value, balance.data.decimals)} ${balance.data.symbol}`
                        : Object.keys(session.namespaces).join(" · ")}
                    </div>
                  </div>
                </div>
                <dl className="kv" style={{ marginTop: 12 }}>
                  <div>
                    <dt>connected</dt>
                    <dd>{String(provider?.connected)}</dd>
                  </div>
                  {evm && (
                    <div>
                      <dt>chainId</dt>
                      <dd>{evm.chainId}</dd>
                    </div>
                  )}
                  {Object.entries(provider?.accountsByChain ?? {}).map(([chain, addresses]) => (
                    <div key={chain}>
                      <dt>
                        {chain}
                        {addresses.length > 1 && <span className="count"> ×{addresses.length}</span>}
                      </dt>
                      <dd className="mono stack">
                        {addresses.map((a) => (
                          <span key={a}>{a}</span>
                        ))}
                      </dd>
                    </div>
                  ))}
                  {Object.entries(session.namespaces)
                    .filter(([, n]) => !(n.accounts ?? []).length)
                    .map(([ns]) => (
                      <div key={ns}>
                        <dt>{ns}</dt>
                        <dd>no accounts</dd>
                      </div>
                    ))}
                  <div>
                    <dt>methods</dt>
                    <dd>
                      {Object.entries(session.namespaces)
                        .map(([ns, n]) => `${ns}: ${n.methods.join(", ")}`)
                        .join(" · ")}
                    </dd>
                  </div>
                  <div>
                    <dt>topic</dt>
                    <dd className="mono">{session.topic}</dd>
                  </div>
                  <div>
                    <dt>expiry</dt>
                    <dd>{new Date(session.expiry * 1000).toISOString()}</dd>
                  </div>
                  <div>
                    <dt>TTL</dt>
                    <dd>
                      propose {TTL.propose}s · request {TTL.request}s · session {TTL.session}s
                    </dd>
                  </div>
                  {evm && (
                    <div>
                      <dt>read</dt>
                      <dd className="mono">{RPC_URL} (evm + http, kernel reads stay on mainnet)</dd>
                    </div>
                  )}
                </dl>
              </>
            ) : (
              <p className="status">No session. Connect first — 4100 unauthorized otherwise.</p>
            )}
          </section>

          {siweChallenge() && (
            <section className="card">
              <h2>Sign-In</h2>
              {cacaos.length ? (
                <>
                  <p className="status">
                    The wallet answered with {cacaos.length} CACAO{cacaos.length > 1 ? "s" : ""} inside the settle. The
                    nonce, domain and issuer were already bound to the session; the signature is not checked here,
                    because a browser is not a trust boundary.
                  </p>
                  <div className="row">
                    <button className="btn method" disabled={!!busy} onClick={() => run("verifyCacao", verifySignIn)}>
                      <code>verifyCacao</code>
                      <span>what your backend would run</span>
                    </button>
                  </div>
                  {cacaos[0] && (
                    <pre className="mono log" style={{ marginTop: 10 }}>
                      {formatCacaoMessage(cacaos[0].p)}
                    </pre>
                  )}
                </>
              ) : (
                <p className="status">
                  Authentication was requested and the wallet settled a session without answering it. That is the
                  expected outcome until a wallet implements the proposal-embedded flow; the fallback is{" "}
                  <code>personal_sign</code> over the same message, which needs no library support.
                </p>
              )}
            </section>
          )}

          <section className="card">
            <h2>Solana</h2>
            <p className="status">Forwarded to the wallet when the session has a solana namespace.</p>
            <div className="row">
              <button
                className="btn method"
                disabled={!!busy || !solanaPubkey}
                onClick={() =>
                  run("solana_getAccounts", () => requireProvider().request({ method: "solana_getAccounts", params: {} }))
                }
              >
                <code>solana_getAccounts</code>
                <span>wallet pubkeys</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !solanaPubkey}
                onClick={() =>
                  run("solana_signMessage", () =>
                    requireProvider().request({
                      method: "solana_signMessage",
                      params: { message: SOLANA_MESSAGE, pubkey: solanaPubkey },
                    }),
                  )
                }
              >
                <code>solana_signMessage</code>
                <span>WalletConnect sample payload</span>
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Bitcoin</h2>
            <p className="status">Forwarded to the wallet when the session has a bip122 namespace.</p>
            <div className="row">
              <button
                className="btn method"
                disabled={!!busy || !bitcoinAccount}
                onClick={() =>
                  run("getAccountAddresses", () =>
                    requireProvider().request({
                      method: "getAccountAddresses",
                      params: { account: bitcoinAccount },
                    }),
                  )
                }
              >
                <code>getAccountAddresses</code>
                <span>UTXO addresses</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !bitcoinAccount}
                onClick={() =>
                  run("signMessage", () =>
                    requireProvider().request({
                      method: "signMessage",
                      params: { account: bitcoinAccount, message: SAMPLE },
                    }),
                  )
                }
              >
                <code>signMessage</code>
                <span>no broadcast</span>
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Cosmos</h2>
            <p className="status">
              Addresses differ per chain, so Osmosis is reached by targeting it on the request rather than switching.
            </p>
            <div className="row">
              <button
                className="btn method"
                disabled={!!busy || !cosmosAccount}
                onClick={() =>
                  run("cosmos_getAccounts", () => requireProvider().request({ method: "cosmos_getAccounts" }))
                }
              >
                <code>cosmos_getAccounts</code>
                <span>address, algo and pubkey</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !cosmosAccount}
                onClick={() =>
                  run("cosmos_signAmino", () =>
                    requireProvider().request({
                      method: "cosmos_signAmino",
                      params: { signerAddress: cosmosAccount, signDoc: aminoSignDoc(cosmosAccount, "cosmoshub-4") },
                    }),
                  )
                }
              >
                <code>cosmos_signAmino</code>
                <span>cosmoshub-4, the active chain</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !cosmosAccount}
                onClick={() =>
                  run("cosmos_signAmino @ osmosis-1", () => {
                    const osmoAccount = provider?.accountsByChain["cosmos:osmosis-1"]?.[0] ?? "";
                    return requireProvider().request(
                      {
                        method: "cosmos_signAmino",
                        params: { signerAddress: osmoAccount, signDoc: aminoSignDoc(osmoAccount, "osmosis-1") },
                      },
                      "cosmos:osmosis-1",
                    );
                  })
                }
              >
                <code>cosmos_signAmino</code>
                <span>osmosis-1, without switching</span>
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Local EIP-1193</h2>
            <div className="row">
              <button
                className="btn method"
                disabled={!!busy || !evm}
                onClick={() => run("enable", () => requireProvider().enable())}
              >
                <code>enable()</code>
                <span>connect if needed, then accounts</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !evm}
                onClick={() => run("eth_accounts", () => requireProvider().request({ method: "eth_accounts" }))}
              >
                <code>eth_accounts</code>
                <span>from the session</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !evm}
                onClick={() =>
                  run("eth_requestAccounts", () => requireProvider().request({ method: "eth_requestAccounts" }))
                }
              >
                <code>eth_requestAccounts</code>
                <span>same, after connect</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !evm}
                onClick={() => run("eth_chainId", () => requireProvider().request({ method: "eth_chainId" }))}
              >
                <code>eth_chainId</code>
                <span>hex chain id</span>
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Switch chain</h2>
            <div className="row">
              {chains.map((chain) => (
                <button
                  key={chain.id}
                  className="btn method"
                  disabled={!!busy || !evm || chainId === chain.id}
                  onClick={() =>
                    run(`wallet_switchEthereumChain ${chain.name}`, () =>
                      requireProvider().request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: numberToHex(chain.id) }],
                      }),
                    )
                  }
                >
                  <code>wallet_switchEthereumChain</code>
                  <span>{chain.name}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Sign</h2>
            <div className="row">
              <button
                className="btn method"
                disabled={!!busy || !address}
                onClick={() =>
                  run("personal_sign", () =>
                    requireProvider().request({
                      method: "personal_sign",
                      params: [utf8Hex(SAMPLE), address],
                    }),
                  )
                }
              >
                <code>personal_sign</code>
                <span>{SAMPLE}</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !address}
                onClick={() =>
                  run("eth_sign", () =>
                    requireProvider().request({
                      method: "eth_sign",
                      params: [address, ethSignHash(SAMPLE)],
                    }),
                  )
                }
              >
                <code>eth_sign</code>
                <span>raw hash, often rejected</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !address || !chainId}
                onClick={() =>
                  run("eth_signTypedData", () => {
                    const { provider: p, address: from, chainId: id } = requireAccount();
                    return p.request({
                      method: "eth_signTypedData",
                      params: [from, mailTypedData(id, from)],
                    });
                  })
                }
              >
                <code>eth_signTypedData</code>
                <span>unprefixed EIP-712</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !address || !chainId}
                onClick={() =>
                  run("eth_signTypedData_v3", () => {
                    const { provider: p, address: from, chainId: id } = requireAccount();
                    return p.request({
                      method: "eth_signTypedData_v3",
                      params: [from, JSON.stringify(mailTypedData(id, from))],
                    });
                  })
                }
              >
                <code>eth_signTypedData_v3</code>
                <span>JSON string</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !address || !chainId}
                onClick={() =>
                  run("eth_signTypedData_v4", () => {
                    const { provider: p, address: from, chainId: id } = requireAccount();
                    return p.request({
                      method: "eth_signTypedData_v4",
                      params: [from, JSON.stringify(mailTypedData(id, from))],
                    });
                  })
                }
              >
                <code>eth_signTypedData_v4</code>
                <span>standard EIP-712</span>
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Transactions</h2>
            <div className="row" style={{ marginBottom: 10 }}>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="to" />
              <input
                type="number"
                min="0"
                step="0.0001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <span className="status">ETH · 0 to self is safest</span>
            </div>
            <div className="row">
              <button
                className="btn method"
                disabled={!!busy || !address}
                onClick={() =>
                  run("eth_sendTransaction", async () => {
                    const hash = await requireProvider().request({
                      method: "eth_sendTransaction",
                      params: [tx()],
                    });
                    if (typeof hash === "string" && publicClient) {
                      const receipt = await publicClient.waitForTransactionReceipt({
                        hash: hash as `0x${string}`,
                      });
                      return { hash, status: receipt.status, explorer: explorer ? `${explorer}/tx/${hash}` : undefined };
                    }
                    return hash;
                  })
                }
              >
                <code>eth_sendTransaction</code>
                <span>broadcast</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !address}
                onClick={() =>
                  run("eth_signTransaction", () =>
                    requireProvider().request({
                      method: "eth_signTransaction",
                      params: [tx()],
                    }),
                  )
                }
              >
                <code>eth_signTransaction</code>
                <span>sign only, no broadcast</span>
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Kernel RPC reads</h2>
            <p className="status">eip155 routeMethod rpc · chain.read via konekt/http · mainnet JSON-RPC</p>
            <div className="row">
              <button
                className="btn method"
                disabled={!!busy || !evm}
                onClick={() => run("eth_blockNumber", () => requireProvider().request({ method: "eth_blockNumber" }))}
              >
                <code>eth_blockNumber</code>
                <span>via chain.read</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !address}
                onClick={() =>
                  run("eth_getBalance", () =>
                    requireProvider().request({
                      method: "eth_getBalance",
                      params: [address, "latest"],
                    }),
                  )
                }
              >
                <code>eth_getBalance</code>
                <span>mainnet account</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !evm}
                onClick={() => run("net_version", () => requireProvider().request({ method: "net_version" }))}
              >
                <code>net_version</code>
                <span>net_</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy || !evm}
                onClick={() =>
                  run("web3_clientVersion", () => requireProvider().request({ method: "web3_clientVersion" }))
                }
              >
                <code>web3_clientVersion</code>
                <span>web3_</span>
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Redirects, storage, errors</h2>
            <div className="row" style={{ marginBottom: 10 }}>
              <input value={redirectHref} onChange={(e) => setRedirectHref(e.target.value)} />
              <button
                className="btn method"
                onClick={() =>
                  run("formatWalletRedirect", async () =>
                    formatWalletRedirect(redirectHref, requestSent?.id ?? 1, requestSent?.topic ?? "topic"),
                  )
                }
              >
                <code>formatWalletRedirect</code>
                <span>id + topic on a href</span>
              </button>
            </div>
            {builtRedirect && <p className="mono" style={{ fontSize: 12 }}>{builtRedirect}</p>}
            <div className="row">
              <button
                className="btn method"
                onClick={() =>
                  run("memoryStorage", async () => {
                    const storage = memoryStorage();
                    await storage.setItem("showcase", SAMPLE);
                    const got = await storage.getItem("showcase");
                    await storage.removeItem("showcase");
                    return { wrote: SAMPLE, read: got, afterRemove: await storage.getItem("showcase") };
                  })
                }
              >
                <code>memoryStorage</code>
                <span>set / get / remove</span>
              </button>
              <button
                className="btn method"
                disabled={!!busy}
                onClick={() =>
                  run("unknown method", () => requireProvider().request({ method: "wallet_watchAsset" }))
                }
              >
                <code>wallet_watchAsset</code>
                <span>4200 unsupported ({RpcErrorCode.unsupportedMethod})</span>
              </button>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <h2>Last result {busy ? `· ${busy}` : ""}</h2>
            {outcome ? (
              <pre className={`pre ${outcome.ok ? "ok" : "err"}`}>
                {outcome.label}
                {"\n"}
                {outcome.value}
              </pre>
            ) : (
              <p className="status">Run a method. Wallet prompts arrive as request_sent.</p>
            )}
          </section>
          <section className="card">
            <h2>Event log</h2>
            <div className="log">
              {log.length === 0 && <p className="status">display_uri, request_sent, debug, session events…</p>}
              {log.map((item, i) => (
                <article key={`${item.t}-${i}`}>
                  <div>
                    <span className="status">{item.t}</span> <b>{item.name}</b>
                  </div>
                  <div className="mono">{item.value}</div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
