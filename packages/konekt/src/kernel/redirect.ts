import { fromUtf8, toB64url } from "./bytes.ts";

export function formatWalletRedirect(href: string, id: number, topic: string): string {
  const payload = `requestId=${id}&sessionTopic=${topic}`;
  const base = href.endsWith("/") ? href.slice(0, -1) : href;
  if (base.startsWith("https://t.me")) {
    const sep = base.includes("?") ? "&startapp=" : "?startapp=";
    return `${base}${sep}${toB64url(fromUtf8(payload))}`;
  }
  return `${base}/wc?${payload}`;
}

export function shouldRedirect(disableDeepLink?: boolean, href?: string): href is string {
  return Boolean(href) && !disableDeepLink;
}
