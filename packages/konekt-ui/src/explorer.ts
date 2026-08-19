export const EXPLORER_URL = "https://explorer-api.walletconnect.com";

export const FEATURED_WALLET_IDS = [
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
  "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369",
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0",
] as const;

export type WalletLinks = {
  native: string;
  universal: string;
};

export type ExplorerWallet = {
  id: string;
  name: string;
  rdns: string;
  imageUrl: string;
  mobile: WalletLinks;
  desktop: WalletLinks;
};

export type FetchWalletsOptions = {
  projectId: string;
  entries?: number | undefined;
  page?: number | undefined;
  search?: string | undefined;
  ids?: readonly string[] | undefined;
  /** CAIP-2 chain ids. Only wallets that support one of them are listed. */
  chains?: readonly string[] | undefined;
};

export type FetchWalletsResult = {
  wallets: ExplorerWallet[];
  total: number;
};

/** Which wallets a modal may offer. Ids are explorer ids, the same ones `FEATURED_WALLET_IDS` holds. */
export type WalletFilter = {
  /** When set, only these wallets are listed. */
  include?: readonly string[] | undefined;
  /** Never listed. The explorer has no exclude parameter, so this is applied to each page it returns. */
  exclude?: readonly string[] | undefined;
  /** Listed on the first screen. Defaults to `FEATURED_WALLET_IDS`. */
  featured?: readonly string[] | undefined;
};

export function filterWallets(wallets: readonly ExplorerWallet[], filter?: WalletFilter): ExplorerWallet[] {
  const include = filter?.include;
  const exclude = filter?.exclude;
  if (!include?.length && !exclude?.length) return [...wallets];
  return wallets.filter((w) => (!include?.length || include.includes(w.id)) && !exclude?.includes(w.id));
}

function readString(o: Record<string, unknown>, key: string): string {
  const value = o[key];
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

function parseLinks(value: unknown): WalletLinks {
  const o = asRecord(value);
  if (!o) return { native: "", universal: "" };
  return { native: readString(o, "native"), universal: readString(o, "universal") };
}

function parseImageUrl(value: unknown): string {
  const o = asRecord(value);
  if (!o) return "";
  return readString(o, "md") || readString(o, "sm") || readString(o, "lg");
}

export function parseWallet(value: unknown): ExplorerWallet | undefined {
  const o = asRecord(value);
  if (!o) return undefined;
  const id = readString(o, "id");
  const name = readString(o, "name");
  if (!id || !name) return undefined;
  return {
    id,
    name,
    rdns: readString(o, "rdns"),
    imageUrl: parseImageUrl(o.image_url),
    mobile: parseLinks(o.mobile),
    desktop: parseLinks(o.desktop),
  };
}

export function parseListings(body: unknown): FetchWalletsResult {
  const o = asRecord(body);
  if (!o) return { wallets: [], total: 0 };
  const listings = asRecord(o.listings);
  const wallets: ExplorerWallet[] = [];
  if (listings) {
    for (const value of Object.values(listings)) {
      const wallet = parseWallet(value);
      if (wallet) wallets.push(wallet);
    }
  }
  const total = typeof o.total === "number" ? o.total : typeof o.count === "number" ? o.count : wallets.length;
  return { wallets, total };
}

export async function fetchWallets(opts: FetchWalletsOptions): Promise<FetchWalletsResult> {
  const params = new URLSearchParams();
  params.set("projectId", opts.projectId);
  if (opts.entries !== undefined) params.set("entries", String(opts.entries));
  if (opts.page !== undefined) params.set("page", String(opts.page));
  if (opts.search) params.set("search", opts.search);
  if (opts.ids?.length) params.set("ids", opts.ids.join(","));
  if (opts.chains?.length) params.set("chains", opts.chains.join(","));
  const res = await fetch(`${EXPLORER_URL}/v3/wallets?${params}`);
  if (!res.ok) throw new Error(`Explorer ${res.status}: wallets request failed. Check projectId.`);
  return parseListings(await res.json());
}
