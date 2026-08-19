/** Base URL of WalletConnect's public wallet listing API. */
export const EXPLORER_URL = "https://explorer-api.walletconnect.com";

/** Default WalletConnect Explorer IDs shown on the first modal screen. */
export const FEATURED_WALLET_IDS = [
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96",
  "1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369",
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0",
] as const;

/** Native-scheme and HTTPS universal links advertised for one platform. */
export type WalletLinks = {
  /** Custom-scheme link, for example `metamask://`. Empty when unavailable. */
  native: string;
  /** HTTPS universal link. Empty when unavailable. */
  universal: string;
};

/** Normalized wallet listing returned by {@link fetchWallets}. */
export type ExplorerWallet = {
  /** WalletConnect Explorer ID. */
  id: string;
  /** Human-readable wallet name. */
  name: string;
  /** Reverse-domain identifier used to match an installed EIP-6963 wallet. */
  rdns: string;
  /** Best available wallet image URL. */
  imageUrl: string;
  /** Links advertised for mobile platforms. */
  mobile: WalletLinks;
  /** Links advertised for desktop platforms. */
  desktop: WalletLinks;
};

/** Query options for {@link fetchWallets}. */
export type FetchWalletsOptions = {
  /** WalletConnect Cloud project ID. */
  projectId: string;
  /** Maximum number of entries to request. */
  entries?: number | undefined;
  /** One-based result page. */
  page?: number | undefined;
  /** Wallet-name search text. */
  search?: string | undefined;
  /** Exact WalletConnect Explorer IDs to request. */
  ids?: readonly string[] | undefined;
  /** CAIP-2 chain IDs. Results must support at least one. */
  chains?: readonly string[] | undefined;
};

/** One normalized page from WalletConnect Explorer. */
export type FetchWalletsResult = {
  /** Valid wallet entries parsed from the response. */
  wallets: ExplorerWallet[];
  /** Total matching entries reported by Explorer. */
  total: number;
};

/** WalletConnect Explorer filters accepted by {@link WalletModal}. */
export type WalletFilter = {
  /** When set, only these Explorer IDs are listed. */
  include?: readonly string[] | undefined;
  /** Explorer IDs removed from each page after it is returned. */
  exclude?: readonly string[] | undefined;
  /** Explorer IDs listed on the first screen. Defaults to {@link FEATURED_WALLET_IDS}. */
  featured?: readonly string[] | undefined;
};

/** Applies `include` and `exclude` Explorer ID filters to an existing wallet list. */
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

/**
 * Parses and validates one unknown WalletConnect Explorer listing.
 *
 * @returns A normalized wallet, or `undefined` when the value has no ID or name.
 */
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

/** Parses a WalletConnect Explorer response, dropping malformed listings. */
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

/**
 * Loads one page of wallet listings from WalletConnect Explorer.
 *
 * @throws When Explorer returns a non-successful HTTP response.
 */
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
