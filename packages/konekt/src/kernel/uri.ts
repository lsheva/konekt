export type WcUri = {
  protocol: string;
  topic: string;
  version: number;
  symKey: string;
  relay: { protocol: string };
  expiryTimestamp?: number;
};

export function formatUri(p: WcUri): string {
  const q = new URLSearchParams();
  const entries: [string, string][] = [
    ["relay-protocol", p.relay.protocol],
    ["symKey", p.symKey],
  ];
  if (p.expiryTimestamp !== undefined) entries.push(["expiryTimestamp", String(p.expiryTimestamp)]);
  for (const [k, v] of entries.sort(([a], [b]) => a.localeCompare(b))) q.append(k, v);
  return `${p.protocol}:${p.topic}@${p.version}?${q}`;
}

export function parseUri(str: string): WcUri {
  const raw = str.replace(/^wc:\/\//, "wc:").replace(/^wc:/, "");
  const [path = "", query = ""] = raw.split("?");
  const [topicRaw = "", version] = path.split("@");
  const topic = topicRaw.replace(/^\/\//, "");
  const q = new URLSearchParams(query);
  const symKey = q.get("symKey");
  if (!topic || !symKey) throw new Error("invalid wc uri");
  const expiryTimestamp = q.get("expiryTimestamp");
  return {
    protocol: "wc",
    topic,
    version: Number(version),
    symKey,
    relay: { protocol: q.get("relay-protocol") ?? "irn" },
    ...(expiryTimestamp ? { expiryTimestamp: Number(expiryTimestamp) } : {}),
  };
}
