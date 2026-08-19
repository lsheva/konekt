/**
 * Structured provider diagnostic.
 *
 * Events report relay lifecycle and protocol progress without exposing encrypted payload contents.
 */
export type DebugEvent =
  | { type: "socket_open" }
  | { type: "socket_close"; code: number; reason: string }
  | { type: "publish"; topic: string; tag?: number }
  | { type: "inbound"; topic: string }
  | { type: "settle" }
  | { type: "error"; error: string };

/** Callback passed as `CreateProviderOptions.onDebug` to receive structured diagnostics. */
export type OnDebug = (e: DebugEvent) => void;

const enabled = () => typeof process !== "undefined" && process.env.WC_DEBUG === "1";

function clip(v: unknown): unknown {
  if (typeof v === "string") return v.length > 40 ? `${v.slice(0, 12)}…(${v.length})` : v;
  if (Array.isArray(v)) return v.map(clip);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = clip(val);
    return out;
  }
  return v;
}

export function log(side: "→" | "←" | "i", label: string, extra?: unknown) {
  if (!enabled()) return;
  const t = new Date().toISOString().slice(11, 23);
  const rest = extra === undefined ? "" : ` ${JSON.stringify(clip(extra))}`;
  console.error(`${t} ${side} ${label}${rest}`);
}
