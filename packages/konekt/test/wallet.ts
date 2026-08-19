import { SignClient } from "@walletconnect/sign-client";
import { formatMessage } from "@walletconnect/utils";
import { createWalletClient, defineChain, type Hex, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const debug = (...args: unknown[]) => {
  if (process.env.WC_DEBUG === "1") console.error(...args);
};

export const ACCOUNT = {
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const,
  key: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const,
};

export type WalletPeerOpts = {
  relayUrl: string;
  chainId: number;
  projectId?: string | undefined;
  rpcUrl?: string | undefined;
  delayMs?: number | undefined;
};

export type WalletPeer = {
  pair: (uri: string) => Promise<void>;
  emit: (name: string, data: unknown, chainId?: string) => Promise<void>;
  disconnectSession: () => Promise<void>;
  close: () => Promise<void>;
};

let seq = 0;
const nextPrefix = () => `w${(++seq).toString(36)}`;

type AuthenticationRequest = {
  domain: string;
  chains: string[];
  nonce: string;
  aud: string;
  version: string;
  iat: string;
  statement?: string;
  exp?: string;
  nbf?: string;
  requestId?: string;
  resources?: string[];
};

/**
 * The wallet half of one-click auth: one CACAO per requested chain, signed over the message the
 * reference SDK formats. Ours is verified against the same bytes, so the two must agree.
 */
async function signAuthentication(
  account: ReturnType<typeof privateKeyToAccount>,
  params: { requests?: { authentication?: AuthenticationRequest[] } },
) {
  const request = params.requests?.authentication?.[0];
  if (!request) return;
  const cacaos = [];
  for (const chain of request.chains) {
    const iss = `did:pkh:${chain}:${account.address}`;
    // Their types spell the optional fields without `| undefined`, so these keys must be absent.
    const payload = {
      iss,
      domain: request.domain,
      aud: request.aud,
      version: request.version,
      nonce: request.nonce,
      iat: request.iat,
      ...(request.statement ? { statement: request.statement } : {}),
      ...(request.exp ? { exp: request.exp } : {}),
      ...(request.nbf ? { nbf: request.nbf } : {}),
      ...(request.requestId ? { requestId: request.requestId } : {}),
      ...(request.resources ? { resources: request.resources } : {}),
    };
    const s = await account.signMessage({ message: formatMessage(payload, iss) });
    cacaos.push({ h: { t: "caip122" as const }, p: payload, s: { t: "eip191" as const, s } });
  }
  debug("wallet → signed CACAOs", cacaos.length);
  return cacaos;
}

async function openWalletPeer(opts: WalletPeerOpts & { customStoragePrefix?: string }): Promise<WalletPeer> {
  const account = privateKeyToAccount(ACCOUNT.key);
  const wallet = opts.rpcUrl
    ? createWalletClient({
        account,
        chain: defineChain({
          id: opts.chainId,
          name: "test",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [opts.rpcUrl] } },
        }),
        transport: http(opts.rpcUrl),
      })
    : undefined;

  const client = await SignClient.init({
    projectId: opts.projectId ?? "local",
    relayUrl: opts.relayUrl,
    logger: "silent",
    storageOptions: { database: ":memory:" },
    ...(opts.customStoragePrefix !== undefined ? { customStoragePrefix: opts.customStoragePrefix } : {}),
    metadata: { name: "test-wallet", description: "", url: "https://wallet.local", icons: [] },
  });

  const delayMs = opts.delayMs;
  let topic: string | undefined;
  let closed = false;
  const delays = new Set<ReturnType<typeof setTimeout>>();

  client.on("session_proposal", async ({ id, params }) => {
    debug("wallet ← session_proposal", id);
    try {
      const namespaces: Record<string, { accounts: string[]; methods: string[]; events: string[] }> = {};
      for (const [ns, value] of Object.entries(params.optionalNamespaces)) {
        namespaces[ns] = {
          methods: value.methods,
          events: value.events,
          accounts: (value.chains ?? []).map((c) => `${c}:${ACCOUNT.address}`),
        };
      }
      debug("wallet → approve", id);
      const authentication = await signAuthentication(account, params);
      const approval = await client.approve({
        id,
        namespaces,
        ...(authentication ? { proposalRequestsResponses: { authentication } } : {}),
      });
      topic = approval.topic;
      debug("wallet ← session settled", topic);
      await approval.acknowledged();
      debug("wallet ← session acked", topic);
    } catch (e) {
      console.error("wallet approve failed", e);
    }
  });

  client.on("session_request", async ({ id, topic: t, params }) => {
    const { request } = params;
    try {
      if (delayMs) {
        await new Promise<void>((r) => {
          const timer = setTimeout(r, delayMs);
          delays.add(timer);
        });
        if (closed) return;
      }
      let result: string;
      if (request.method === "personal_sign" || request.method === "eth_sign") {
        const msg = request.method === "personal_sign" ? request.params[0] : request.params[1];
        result = await account.signMessage({
          message: typeof msg === "string" && isHex(msg) ? { raw: msg } : String(msg),
        });
      } else if (request.method === "eth_sendTransaction") {
        if (wallet) {
          const tx = request.params[0] as { to?: Hex; value?: Hex; data?: Hex; gas?: Hex };
          result = await wallet.sendTransaction({
            ...(tx.to ? { to: tx.to } : {}),
            ...(tx.value ? { value: BigInt(tx.value) } : {}),
            ...(tx.data ? { data: tx.data } : {}),
            ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
          });
        } else {
          result = `0x${"ab".repeat(32)}`;
        }
      } else {
        throw new Error(`unsupported ${request.method}`);
      }
      await client.respond({ topic: t, response: { id, jsonrpc: "2.0", result } });
    } catch (e) {
      await client.respond({
        topic: t,
        response: { id, jsonrpc: "2.0", error: { code: 5000, message: (e as Error).message } },
      });
    }
  });

  return {
    pair: async (uri) => {
      debug("wallet → pair");
      await client.pair({ uri });
      debug("wallet ← pair subscribed");
    },
    emit: async (name, data, chainId = `eip155:${opts.chainId}`) => {
      if (!topic) throw new Error("no session");
      await client.emit({ topic, event: { name, data }, chainId });
    },
    disconnectSession: async () => {
      if (!topic) return;
      await client.disconnect({ topic, reason: { code: 6000, message: "wallet" } });
      topic = undefined;
    },
    close: async () => {
      closed = true;
      for (const timer of delays) clearTimeout(timer);
      delays.clear();
      if (topic) await client.disconnect({ topic, reason: { code: 6000, message: "done" } }).catch(() => {});
      await Promise.race([
        client.core.relayer.transportClose().catch(() => {}),
        new Promise<void>((r) => setTimeout(r, 500)),
      ]);
      (client.core as { heartbeat?: { stop?: () => void } }).heartbeat?.stop?.();
      if (opts.customStoragePrefix !== undefined) {
        const g = globalThis as Record<string, unknown>;
        delete g[`_walletConnectCore_${opts.customStoragePrefix}`];
        delete g[`_walletConnectCore_${opts.customStoragePrefix}_count`];
      }
    },
  };
}

export const WalletPeer = {
  init(opts: WalletPeerOpts): Promise<WalletPeer> {
    return openWalletPeer(opts);
  },
  create(opts: WalletPeerOpts, prefix = nextPrefix()): Promise<WalletPeer> {
    return openWalletPeer({ ...opts, customStoragePrefix: prefix });
  },
};
