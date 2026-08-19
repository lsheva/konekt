import type { ExplorerWallet } from "./explorer.ts";

export function isMobile(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

export function formatWalletLink(href: string, uri: string): string {
  let base = href.trim();
  if (!base) return "";
  const http = base.startsWith("http://") || base.startsWith("https://");
  if (!http && !base.includes("://")) base = `${base.replace(/[/:]/g, "")}://`;
  if (!base.endsWith("/")) base = `${base}/`;
  return `${base}wc?uri=${encodeURIComponent(uri)}`;
}

export function walletHref(wallet: ExplorerWallet, uri: string, mobile = isMobile()): string | undefined {
  const primary = mobile ? wallet.mobile : wallet.desktop;
  const fallback = mobile ? wallet.desktop : wallet.mobile;
  const href = primary.native || primary.universal || fallback.native || fallback.universal;
  if (!href) return undefined;
  const formatted = formatWalletLink(href, uri);
  return formatted || undefined;
}

export function openWalletLink(href: string): void {
  if (isMobile()) window.location.assign(href);
  else window.open(href, "_blank", "noreferrer,noopener");
}
