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
import { isMobile, openWalletLink, walletHref, walletLink } from "./link.ts";
import { Modal } from "./Modal.tsx";
import { pairingRefreshDelay } from "./pairing.ts";
import { QrCode } from "./QrCode.tsx";

const PAGE = 30;

const NO_PROJECT_ID =
  "No WalletConnect project ID for wallet listings. Create the pairing from a Konekt provider or connector, or pass projectId to the pairing hook.";

type View = "home" | "all" | "connect";

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
  /**
   * WalletConnect Cloud project ID the modal uses for Wallet Explorer listings. The pairing hooks
   * read it from the Konekt provider or connector, so the modal never needs it separately.
   */
  projectId?: string | undefined;
};

/** Props for {@link WalletModal}. */
export type WalletModalProps = WcAppearanceProps & {
  /** Whether the dialog is rendered. */
  open: boolean;
  /** Connection binding created by `useProviderPairing()` or `useWagmiPairing()`. */
  pairing: Pairing;
  /** CAIP-2 chain IDs. Explorer results must support at least one. Defaults to `pairing.chains`. */
  chains?: readonly string[] | undefined;
  /** Include, exclude, and featured lists of WalletConnect Explorer IDs. */
  wallets?: WalletFilter | undefined;
  /**
   * Runs when an unfinished pairing attempt is discarded: the user left, or the modal replaced a
   * pairing that was about to lapse. Use it to cancel work owned outside the `Pairing`, such as a
   * wagmi connector's pending connection.
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

function WalletRowSkeleton({ unstyled }: { unstyled?: boolean | undefined }) {
  return (
    <div className={uiClass("kui-row kui-row-skeleton", unstyled)} data-kui-slot="wallet-skeleton" aria-hidden="true">
      <span className={uiClass("kui-row-icon kui-skeleton-block", unstyled)} />
      <span className={uiClass("kui-skeleton-line", unstyled)} />
    </div>
  );
}

/**
 * Wallet picker and WalletConnect pairing dialog.
 *
 * The modal loads compatible wallets from WalletConnect Explorer and includes any local wallets
 * from the pairing binding. On a desktop browser it starts pairing when the user asks for a QR
 * code, and closing that view runs the teardown returned by `pairing.start`.
 *
 * On a phone it instead pairs as soon as it opens, lists only wallets reachable by a mobile link,
 * and leaves for the wallet inside the tap that chose it. Both are required: WebKit refuses to open
 * a custom scheme once the gesture that asked for it has expired, so the URI cannot be fetched
 * first. A pairing that is about to lapse is replaced with a fresh one.
 *
 * The dialog traps keyboard focus, closes on Escape, restores previous focus, and labels its
 * controls for assistive technology.
 */
export function WalletModal({
  open,
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
  const { connected, local, connectLocal, start, reset, error: pairError, projectId } = pairing;

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
  const [featuredReady, setFeaturedReady] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const opened = useRef<string | undefined>(undefined);

  const mobile = isMobile();

  /** Only `pairing.start` is promised to be stable, so nothing else may restart a live pairing. */
  const latest = useRef({ reset, onDismiss });
  latest.current = { reset, onDismiss };

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
    setReplacing(false);
    onClose();
  }, [connected, onClose, onDismiss, reset]);

  useEffect(() => {
    if (connected && open) onClose();
  }, [connected, open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (!projectId) {
      setError(NO_PROJECT_ID);
      setFeaturedReady(true);
      return;
    }
    let cancelled = false;
    const ids = idList(featuredKey) ?? [];
    setError(undefined);
    void fetchWallets({ projectId, ids, entries: ids.length, chains: idList(chainKey) })
      .then((r) => {
        if (!cancelled) setFeatured(filterWallets(r.wallets, filter));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setFeaturedReady(true);
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
    if (!projectId) {
      setError(NO_PROJECT_ID);
      return;
    }
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

  /** A phone pairs while the user is still choosing, so the deep link can open inside their tap. */
  const pairingWanted = open && (mobile || view === "connect");

  useEffect(() => {
    if (!pairingWanted) return;
    let stop = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live: string | undefined;
    let replaced = false;

    const onUri = (next: string) => {
      live = next;
      setUri(next);
      setReplacing(false);
      /** Whatever the discarded attempt reported on its way out is not this pairing's news. */
      if (replaced) {
        replaced = false;
        latest.current.reset();
      }
      const delay = pairingRefreshDelay(next);
      if (delay !== undefined) timer = setTimeout(replace, delay);
    };

    /** A pairing nobody can answer any more is worse than the wait for a new one. */
    function replace() {
      clearTimeout(timer);
      latest.current.onDismiss?.();
      stop();
      live = undefined;
      setUri(undefined);
      setReplacing(true);
      replaced = true;
      stop = start(onUri);
    }

    /** Timers are throttled or suspended in a hidden tab, so coming back is its own check. */
    const onVisible = () => {
      if (document.visibilityState === "visible" && live && pairingRefreshDelay(live) === 0) replace();
    };

    stop = start(onUri);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [pairingWanted, start]);

  /** Only the first attempt for a chosen wallet leaves on its own; a replacement waits to be asked. */
  useEffect(() => {
    if (!uri || !selected || !mobile || opened.current) return;
    const href = walletHref(selected, uri, true);
    if (!href) return;
    opened.current = href;
    openWalletLink(href);
  }, [uri, selected, mobile]);

  const featuredIds = idList(featuredKey) ?? [];
  const reachable = (list: readonly ExplorerWallet[]) => (mobile ? list.filter((w) => walletLink(w, true)) : list);
  const featuredOnly = reachable(featured.filter((w) => !localFor(w, local)));
  const showFeaturedSkeletons = !featuredReady && featured.length === 0 && featuredIds.length > 0;

  const pickWallet = (wallet: ExplorerWallet) => {
    const match = localFor(wallet, local);
    if (match) {
      connectLocal(match);
      onClose();
      return;
    }
    opened.current = undefined;
    setSelected(wallet);
    setView("connect");
    if (!mobile || !uri) return;
    const href = walletHref(wallet, uri, true);
    if (!href) return;
    opened.current = href;
    openWalletLink(href);
  };

  const loadMore = () => {
    if (!projectId) return;
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

  const title =
    view === "all" ? "All wallets" : view === "connect" ? (selected?.name ?? "WalletConnect") : "Connect wallet";
  const href = uri && selected ? walletHref(selected, uri) : undefined;
  const connectError = view === "connect" && !replacing ? pairError : undefined;
  /** The wallet the phone leaves for, when it advertised a mobile link. A QR code serves the rest. */
  const leaveFor = mobile && selected && walletLink(selected, true) ? selected : undefined;
  const lead = leaveFor
    ? `Continue in ${leaveFor.name}, then come back here`
    : `Scan this QR code with ${selected?.name ?? "your wallet"}${mobile ? "" : " on your phone"}`;
  const goHome = () => {
    if (view === "connect") {
      setSelected(undefined);
      setCopiedUri(false);
      /** A phone keeps its pairing: it was started for the modal, not for one wallet. */
      if (!mobile) {
        onDismiss?.();
        reset();
        setUri(undefined);
      }
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
          <div
            className={uiClass("kui-list", unstyled)}
            data-kui-slot="wallet-list"
            aria-busy={featuredReady ? undefined : true}
          >
            <button
              type="button"
              className={uiClass("kui-row", unstyled)}
              data-kui-slot="wallet-option"
              onClick={() => {
                setSelected(undefined);
                setView("connect");
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
            {showFeaturedSkeletons
              ? featuredIds.map((id) => <WalletRowSkeleton key={id} unstyled={unstyled} />)
              : featuredOnly.map((w) => (
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
              {reachable(listed).map((w) => (
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

        {view === "connect" && (
          <div className={uiClass("kui-qr-wrap", unstyled)} data-kui-slot={leaveFor ? "connecting" : "qr"}>
            {leaveFor ? (
              <div className={uiClass("kui-leaving", unstyled)}>
                <WalletImage
                  name={leaveFor.name}
                  imageUrl={leaveFor.imageUrl}
                  iconClass="kui-leaving-icon"
                  unstyled={unstyled}
                />
                <span className={uiClass("kui-spinner", unstyled)} />
              </div>
            ) : (
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
            )}
            <p className={uiClass("kui-qr-lead", unstyled)}>{lead}</p>
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
