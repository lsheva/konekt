import { readFile, writeFile } from "node:fs/promises";

const report = new URL("../../../size-report.json", import.meta.url);
const guides = new URL("../src/content/docs/guides/", import.meta.url);

const START = "<!-- size-report:start -->";
const END = "<!-- size-report:end -->";

/** Report entry names in the order the guide table shows them, with the label each one gets. */
const rows = [
  ["Provider + EVM", "`Provider` + `evm` initial chunk"],
  ["Crypto cipher fallback", "ChaCha20-Poly1305 lazy chunk"],
  ["Crypto curves fallback", "Ed25519/X25519 compatibility chunk"],
  ["Crypto hashes fallback", "SHA-256/HKDF compatibility chunk"],
  ["HTTP read transport", "`http`"],
  ["SIWE feature", "`siwe` + `cacaosOf`"],
  ["CACAO verifier", "`verifyCacao` + `checkClaims`"],
  ["Solana adapter", "`solana` + `solanaChain`"],
  ["Wallet modal", "`WalletModal` + `useProviderPairing`"],
  ["wagmi connect UI", "wagmi `ConnectButton`"],
  ["konekt-ui styles", "`konekt-ui/styles.css`"],
];

/** Sums the guides quote in prose. Every part must be a row above. */
const totals = {
  headless: ["Provider + EVM", "Crypto cipher fallback"],
  modal: ["Wallet modal", "konekt-ui styles"],
  wagmiUi: ["wagmi connect UI", "konekt-ui styles"],
};

/** Files that cite a derived total, so a new measurement cannot leave stale prose behind. */
const citations = {
  "bundle-size.md": ["headless", "modal", "stack"],
  "why-konekt.md": ["headless", "modal", "stack"],
  "konekt-ui.md": ["modal", "wagmiUi"],
  "getting-started.md": ["headless"],
};

// Round on bytes: (2955 / 1000).toFixed(2) is "2.95" because 2.955 is not exact in binary.
const format = (bytes) => (bytes < 1000 ? `${bytes} B` : `${(Math.round(bytes / 10) / 100).toFixed(2)} kB`);

const measured = new Map(JSON.parse(await readFile(report, "utf8")).map((entry) => [entry.name, entry.size]));

const sizeOf = (name) => {
  const size = measured.get(name);
  if (size === undefined) throw new Error(`size-report.json has no entry named "${name}". Run pnpm size:update.`);
  return size;
};

const table = [
  "| Import | Minified + gzip |",
  "| --- | ---: |",
  ...rows.map(([name, label]) => `| ${label} | ${format(sizeOf(name))} |`),
].join("\n");

const sums = Object.fromEntries(
  Object.entries(totals).map(([key, parts]) => [key, parts.reduce((total, name) => total + sizeOf(name), 0)]),
);
sums.stack = sums.headless + sums.modal;

const guide = new URL("bundle-size.md", guides);
const source = await readFile(guide, "utf8");
const start = source.indexOf(START);
const end = source.indexOf(END);
if (start === -1 || end === -1) throw new Error(`bundle-size.md is missing the ${START} / ${END} markers.`);

const next = `${source.slice(0, start + START.length)}\n\n${table}\n\n${source.slice(end)}`;
if (next !== source) await writeFile(guide, next);

const stale = [];
for (const [file, keys] of Object.entries(citations)) {
  const text = await readFile(new URL(file, guides), "utf8");
  for (const key of keys) {
    const expected = format(sums[key]);
    if (!text.includes(expected)) stale.push(`${file} should quote the ${key} total as ${expected}`);
  }
}

if (stale.length > 0) {
  throw new Error(`Bundle sizes changed and the guides still quote the old totals:\n${stale.join("\n")}`);
}
