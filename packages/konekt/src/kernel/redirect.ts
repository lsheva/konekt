import { fromUtf8, toB64url } from "./bytes.ts";

/**
 * Builds a wallet URL for a request on an existing session.
 *
 * Telegram Mini App URLs receive a base64url `startapp` payload. Other URLs receive a
 * `/wc?requestId=…&sessionTopic=…` path.
 *
 * This is not a pairing deep-link formatter: it carries a session request ID and topic, not a
 * `wc:` pairing URI.
 *
 * @param href Native or universal wallet URL.
 * @param id JSON-RPC ID of the published session request.
 * @param topic WalletConnect topic of the approved session.
 */
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
