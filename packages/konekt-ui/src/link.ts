import type { ExplorerWallet } from "./explorer.ts";

/**
 * Detects a likely touch-first mobile device from its primary pointer.
 *
 * Returns `false` during server rendering.
 */
export function isMobile(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/**
 * Adds a URL-encoded WalletConnect pairing URI to a wallet's native or universal base URL.
 *
 * A base without a scheme is treated as a custom native scheme. For example, `"example"` becomes
 * `example://wc?uri=…`.
 */
export function formatWalletLink(href: string, uri: string): string {
  let base = href.trim();
  if (!base) return "";
  const http = base.startsWith("http://") || base.startsWith("https://");
  if (!http && !base.includes("://")) base = `${base.replace(/[/:]/g, "")}://`;
  if (!base.endsWith("/")) base = `${base}/`;
  return `${base}wc?uri=${encodeURIComponent(uri)}`;
}

/**
 * Selects and formats the best available link for a wallet and platform.
 *
 * The preferred platform falls back to the other platform when it has no link.
 */
export function walletHref(wallet: ExplorerWallet, uri: string, mobile = isMobile()): string | undefined {
  const primary = mobile ? wallet.mobile : wallet.desktop;
  const fallback = mobile ? wallet.desktop : wallet.mobile;
  const href = primary.native || primary.universal || fallback.native || fallback.universal;
  if (!href) return undefined;
  const formatted = formatWalletLink(href, uri);
  return formatted || undefined;
}

/**
 * Opens a formatted wallet link.
 *
 * Mobile navigation replaces the current page. Desktop navigation opens a protected new tab.
 */
export function openWalletLink(href: string): void {
  if (isMobile()) window.location.assign(href);
  else window.open(href, "_blank", "noreferrer,noopener");
}
