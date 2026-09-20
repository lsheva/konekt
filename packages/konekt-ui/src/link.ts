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
 * The base URL a wallet advertised for one platform, native scheme first.
 *
 * Platforms do not stand in for each other: a listing with only desktop links cannot be reached
 * from a phone, and the caller offers a QR code instead.
 *
 * @returns `undefined` when the wallet advertised no link for that platform.
 */
export function walletLink(wallet: ExplorerWallet, mobile = isMobile()): string | undefined {
  const links = mobile ? wallet.mobile : wallet.desktop;
  return links.native || links.universal || undefined;
}

/** Formats the pairing URI into the wallet's link for one platform. */
export function walletHref(wallet: ExplorerWallet, uri: string, mobile = isMobile()): string | undefined {
  const base = walletLink(wallet, mobile);
  if (!base) return undefined;
  return formatWalletLink(base, uri) || undefined;
}

/**
 * Opens a formatted wallet link.
 *
 * Mobile navigation replaces the current page. Desktop navigation opens a protected new tab. Call
 * this inside the event handler of the tap that asked for it: WebKit refuses to leave for a custom
 * scheme once the gesture has expired.
 */
export function openWalletLink(href: string): void {
  window.open(href, isMobile() ? "_self" : "_blank", "noreferrer,noopener");
}
