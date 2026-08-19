import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uiClass, type WcAppearanceProps } from "./appearance.ts";
import {
  type ExplorerWallet,
  FEATURED_WALLET_IDS,
  fetchWallets,
  filterWallets,
  type WalletFilter,
} from "./explorer.ts";
import { Icon } from "./Icon.tsx";
import { isMobile, openWalletLink, walletHref } from "./link.ts";
import { Modal } from "./Modal.tsx";
import { QrCode } from "./QrCode.tsx";

const PAGE = 30;

type View = "home" | "all" | "qr";

/** A wallet the browser already has: an injected extension, or any connector the app registered. */
export type LocalWallet = {
  /** Stable connector-specific identifier. */
  id: string;
  /** Human-readable wallet name. */
  name: string;
  /** Optional wallet icon URL. */
  icon?: string | undefined;
  /** EIP-6963 rdns when the wallet announced one. Used to dedupe against explorer listings. */
  rdns?: string | undefined;
};

/**
 * Connection state and actions consumed by {@link WalletModal}.
 *
 * Use `useProviderPairing()` for a Konekt provider or `useWagmiPairing()` for wagmi instead of
 * building this object by hand.
 */
export type Pairing = {
  /** Whether a wallet is currently connected. */
  connected: boolean;
  /** Wallets already available through registered browser connectors. */
  local: readonly LocalWallet[];
  /** Connects one of the local wallets. */
  connectLocal: (wallet: LocalWallet) => void;
  /** Starts WalletConnect pairing and reports its URI. The returned teardown cancels or detaches it. */
  start: (onUri: (uri: string) => void) => () => void;
  /** Clears connection errors before a new modal flow. */
  reset: () => void;
  /** Human-readable pairing error to display in the modal. */
  error?: string | undefined;
  /** CAIP-2 chain IDs known by the binding. The modal's `chains` prop overrides them. */
  chains?: readonly string[] | undefined;
};

/** Props for {@link WalletModal}. */
export type WalletModalProps = WcAppearanceProps & {
  /** Whether the dialog is rendered. */
  open: boolean;
  /** WalletConnect Cloud project ID used to query the Wallet Explorer. */
  projectId: string;
  /** Connection binding created by `useProviderPairing()` or `useWagmiPairing()`. */
  pairing: Pairing;
  /** CAIP-2 chain IDs. Explorer results must support at least one. Defaults to `pairing.chains`. */
  chains?: readonly string[] | undefined;
  /** Include, exclude, and featured lists of WalletConnect Explorer IDs. */
  wallets?: WalletFilter | undefined;
  /**
   * Runs when the user leaves an unfinished pairing flow. Use it to cancel work owned outside the
   * `Pairing`, such as a wagmi connector's pending connection.
   */
  onDismiss?: (() => void) | undefined;
  /** Requests that the controlling component set `open` to `false`. */
  onClose: () => void;
};

function idKey(ids?: readonly string[]): string {
  return ids?.join(",") ?? "";
}

function idList(key: string): string[] | undefined {
  return key ? key.split(",") : undefined;
}

function localFor(wallet: ExplorerWallet, local: readonly LocalWallet[]): LocalWallet | undefined {
  return local.find((candidate) => {
    if (wallet.rdns && candidate.rdns && (candidate.rdns === wallet.rdns || candidate.rdns.endsWith(wallet.rdns))) {
      return true;
    }
    return candidate.name.toLowerCase() === wallet.name.toLowerCase();
  });
}

type WalletEntryProps = {
  name: string;
  imageUrl?: string | undefined;
  tag?: string | undefined;
  onClick: () => void;
  unstyled?: boolean | undefined;
};

function WalletImage({
  name,
  imageUrl,
  iconClass,
  unstyled,
}: Pick<WalletEntryProps, "name" | "imageUrl" | "unstyled"> & { iconClass?: string | undefined }) {
  if (imageUrl) return <img className={uiClass(iconClass ?? "", unstyled)} src={imageUrl} alt="" />;
  const fallback = iconClass ? `${iconClass} kui-fallback` : "kui-fallback";
  return <span className={uiClass(fallback, unstyled)}>{name[0]?.toUpperCase() ?? "?"}</span>;
}

function WalletRow({ name, imageUrl, tag, onClick, unstyled }: WalletEntryProps) {
  return (
    <button type="button" className={uiClass("kui-row", unstyled)} data-kui-slot="wallet" onClick={onClick}>
      <WalletImage name={name} imageUrl={imageUrl} iconClass="kui-row-icon" unstyled={unstyled} />
      <span className={uiClass("kui-row-name", unstyled)} title={name}>
        {name}
      </span>
      {tag && <span className={uiClass("kui-tag", unstyled)}>{tag}</span>}
    </button>
  );
}

function WalletCard({ name, imageUrl, onClick, unstyled }: WalletEntryProps) {
  return (
    <button type="button" className={uiClass("kui-card", unstyled)} data-kui-slot="wallet" onClick={onClick}>
      <WalletImage name={name} imageUrl={imageUrl} unstyled={unstyled} />
      <span title={name}>{name}</span>
    </button>
  );
}

/**
 * Wallet picker and WalletConnect pairing dialog.
 *
 * The modal loads compatible wallets from WalletConnect Explorer, includes any local wallets from
 * the pairing binding, and starts pairing only when the user enters the QR view. Closing that view
 * runs the teardown returned by `pairing.start`.
 *
 * The dialog traps keyboard focus, closes on Escape, restores previous focus, and labels its
 * controls for assistive technology.
 */
export function WalletModal({
  open,
  projectId,
  pairing,
  chains,
  wallets,
  onDismiss,
  onClose,
  className,
  style,
  theme,
  unstyled,
}: WalletModalProps) {
  const { connected, local, connectLocal, start, reset, error: pairError } = pairing;

  const [view, setView] = useState<View>("home");
  const [uri, setUri] = useState<string>();
  const [selected, setSelected] = useState<ExplorerWallet>();
  const [featured, setFeatured] = useState<ExplorerWallet[]>([]);
  const [listed, setListed] = useState<ExplorerWallet[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string>();
  const [copiedUri, setCopiedUri] = useState(false);
  const opened = useRef<string | undefined>(undefined);

  const chainKey = idKey(chains ?? pairing.chains);
  const includeKey = idKey(wallets?.include);
  const excludeKey = idKey(wallets?.exclude);
  const featuredKey = idKey(wallets?.featured ?? wallets?.include ?? FEATURED_WALLET_IDS);
  const filter = useMemo<WalletFilter>(
    () => ({ include: idList(includeKey), exclude: idList(excludeKey) }),
    [includeKey, excludeKey],
  );

  const close = useCallback(() => {
    if (!connected) onDismiss?.();
    reset();
    setView("home");
    setUri(undefined);
    setSelected(undefined);
    setSearch("");
    setQuery("");
    setLoaded(false);
    setCopiedUri(false);
    onClose();
  }, [connected, onClose, onDismiss, reset]);

  useEffect(() => {
    if (connected && open) onClose();
  }, [connected, open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const ids = idList(featuredKey) ?? [];
    setError(undefined);
    void fetchWallets({ projectId, ids, entries: ids.length, chains: idList(chainKey) })
      .then((r) => {
        if (!cancelled) setFeatured(filterWallets(r.wallets, filter));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, featuredKey, chainKey, filter]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open || view !== "all") return;
    let cancelled = false;
    const include = idList(includeKey);
    setLoading(true);
    setLoaded(false);
    setError(undefined);
    void fetchWallets({
      projectId,
      chains: idList(chainKey),
      ids: include,
      page: include ? undefined : 1,
      entries: include ? include.length : PAGE,
      search: query || undefined,
    })
      .then((r) => {
        if (cancelled) return;
        const found = filterWallets(r.wallets, filter);
        setListed(found);
        setTotal(include ? found.length : r.total);
        setPage(1);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, view, projectId, query, chainKey, includeKey, filter]);

  useEffect(() => {
    if (!open || view !== "qr") return;
    return start(setUri);
  }, [open, view, start]);

  useEffect(() => {
    if (!uri || !selected || !isMobile()) return;
    const href = walletHref(selected, uri, true);
    if (!href || opened.current === href) return;
    opened.current = href;
    openWalletLink(href);
  }, [uri, selected]);

  const featuredOnly = featured.filter((w) => !localFor(w, local));

  const pickWallet = (wallet: ExplorerWallet) => {
    const match = localFor(wallet, local);
    if (match) {
      connectLocal(match);
      onClose();
      return;
    }
    opened.current = undefined;
    setSelected(wallet);
    setView("qr");
  };

  const loadMore = () => {
    const next = page + 1;
    setLoading(true);
    void fetchWallets({
      projectId,
      chains: idList(chainKey),
      page: next,
      entries: PAGE,
      search: query || undefined,
    })
      .then((r) => {
        setListed((prev) => [...prev, ...filterWallets(r.wallets, filter)]);
        setTotal(r.total);
        setPage(next);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  const title = view === "all" ? "All wallets" : view === "qr" ? (selected?.name ?? "WalletConnect") : "Connect wallet";
  const href = uri && selected ? walletHref(selected, uri) : undefined;
  const connectError = view === "qr" ? pairError : undefined;
  const goHome = () => {
    if (view === "qr") {
      onDismiss?.();
      reset();
      setUri(undefined);
      setSelected(undefined);
      setCopiedUri(false);
    }
    setView("home");
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={close}
      className={className}
      style={style}
      theme={theme}
      unstyled={unstyled}
    >
      <div className={uiClass("kui-head", unstyled)} data-kui-slot="header">
        {view !== "home" && (
          <button
            type="button"
            className={uiClass("kui-icon-btn", unstyled)}
            data-kui-slot="back"
            aria-label="Back"
            onClick={goHome}
          >
            <Icon name="arrow-left" />
          </button>
        )}
        <h2>{title}</h2>
        <button
          type="button"
          className={uiClass("kui-icon-btn", unstyled)}
          data-kui-slot="close"
          aria-label="Close"
          onClick={close}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className={uiClass("kui-body", unstyled)} data-kui-slot="body">
        {(error || connectError) && (
          <p className={uiClass("kui-error", unstyled)} data-kui-slot="error" role="alert">
            {error ?? connectError}
          </p>
        )}

        {view === "home" && (
          <div className={uiClass("kui-list", unstyled)} data-kui-slot="wallet-list">
            <button
              type="button"
              className={uiClass("kui-row", unstyled)}
              data-kui-slot="wallet-option"
              onClick={() => {
                setSelected(undefined);
                setView("qr");
              }}
            >
              <span className={uiClass("kui-row-icon kui-row-icon-soft", unstyled)}>
                <Icon name="qr" />
              </span>
              <span className={uiClass("kui-row-name", unstyled)}>WalletConnect</span>
              <span className={uiClass("kui-tag", unstyled)}>QR code</span>
            </button>
            {local.map((wallet) => (
              <WalletRow
                key={wallet.id}
                name={wallet.name}
                imageUrl={wallet.icon}
                tag="Installed"
                unstyled={unstyled}
                onClick={() => {
                  connectLocal(wallet);
                  onClose();
                }}
              />
            ))}
            {featuredOnly.map((w) => (
              <WalletRow
                key={w.id}
                name={w.name}
                imageUrl={w.imageUrl}
                unstyled={unstyled}
                onClick={() => pickWallet(w)}
              />
            ))}
            <button
              type="button"
              className={uiClass("kui-row", unstyled)}
              data-kui-slot="wallet-option"
              onClick={() => setView("all")}
            >
              <span className={uiClass("kui-row-icon kui-row-icon-soft", unstyled)}>
                <Icon name="grid" />
              </span>
              <span className={uiClass("kui-row-name", unstyled)}>All wallets</span>
              <Icon className={uiClass("kui-chevron", unstyled)} name="chevron-right" />
            </button>
          </div>
        )}

        {view === "all" && (
          <>
            <label className={uiClass("kui-search-wrap", unstyled)}>
              <Icon name="search" />
              <input
                className={uiClass("kui-search", unstyled)}
                data-kui-slot="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by wallet name"
                aria-label="Search wallets"
                autoComplete="off"
              />
            </label>
            {loading && listed.length === 0 && (
              <div className={uiClass("kui-loading", unstyled)} data-kui-slot="status" role="status" aria-live="polite">
                <span className={uiClass("kui-spinner", unstyled)} />
                Loading wallets…
              </div>
            )}
            {loaded && !loading && !error && listed.length === 0 && (
              <p className={uiClass("kui-status", unstyled)} data-kui-slot="status" role="status">
                No wallets found.
              </p>
            )}
            <div className={uiClass("kui-grid", unstyled)} data-kui-slot="wallet-list">
              {listed.map((w) => (
                <WalletCard
                  key={w.id}
                  name={w.name}
                  imageUrl={w.imageUrl}
                  unstyled={unstyled}
                  onClick={() => pickWallet(w)}
                />
              ))}
            </div>
            {listed.length < total && (
              <button
                type="button"
                className={uiClass("kui-ghost", unstyled)}
                data-kui-slot="load-more"
                disabled={loading}
                onClick={loadMore}
              >
                {loading ? "Loading…" : "Load more wallets"}
              </button>
            )}
          </>
        )}

        {view === "qr" && (
          <div className={uiClass("kui-qr-wrap", unstyled)} data-kui-slot="qr">
            <div className={uiClass("kui-qr-card", unstyled)}>
              {uri ? (
                <QrCode value={uri} unstyled={unstyled} />
              ) : (
                <div className={uiClass("kui-qr-waiting", unstyled)}>
                  <span className={uiClass("kui-spinner", unstyled)} />
                  Creating a secure connection…
                </div>
              )}
            </div>
            <p className={uiClass("kui-qr-lead", unstyled)}>
              Scan this QR code with {selected ? selected.name : "your wallet"} on your phone
            </p>
            {href && (
              <button
                type="button"
                className={uiClass("kui-primary", unstyled)}
                data-kui-slot="open-wallet"
                onClick={() => openWalletLink(href)}
              >
                Open {selected?.name ?? "wallet"}
              </button>
            )}
            {uri && (
              <button
                type="button"
                className={uiClass("kui-link", unstyled)}
                data-kui-slot="copy-uri"
                onClick={() => {
                  void navigator.clipboard.writeText(uri);
                  setCopiedUri(true);
                  window.setTimeout(() => setCopiedUri(false), 1500);
                }}
              >
                <Icon name={copiedUri ? "check" : "copy"} />
                {copiedUri ? "Link copied" : "Copy link"}
              </button>
            )}
            <p className={uiClass("kui-qr-note", unstyled)}>Never share your private keys or recovery phrase.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
