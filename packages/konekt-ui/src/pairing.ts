/** How long before a pairing URI lapses that it is replaced with a fresh one, in milliseconds. */
const REFRESH_MARGIN_MS = 20_000;

/**
 * Reads the deadline a WalletConnect pairing URI carries, in unix seconds.
 *
 * The proposal lifetime belongs to the provider, which stamps it into the URI, so UI that has to
 * know when a pairing dies reads it back instead of repeating the number.
 *
 * @returns `undefined` when the URI carries no `expiryTimestamp` or an unreadable one.
 */
export function pairingExpiry(uri: string): number | undefined {
  const query = uri.indexOf("?");
  if (query < 0) return undefined;
  const value = new URLSearchParams(uri.slice(query + 1)).get("expiryTimestamp");
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? seconds : undefined;
}

/**
 * How long a pairing URI may still be offered, in milliseconds.
 *
 * A wallet cannot answer a lapsed pairing, so UI that keeps one on screen replaces it while there
 * is still time to hand out the next one.
 *
 * @returns `0` when the URI is spent, or `undefined` when it carries no deadline to work from.
 */
export function pairingRefreshDelay(uri: string, now = Date.now()): number | undefined {
  const expiry = pairingExpiry(uri);
  if (expiry === undefined) return undefined;
  return Math.max(expiry * 1000 - now - REFRESH_MARGIN_MS, 0);
}
