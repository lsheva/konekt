import { readFile, writeFile } from "node:fs/promises";

const report = new URL("../../../size-report.json", import.meta.url);
const appReport = new URL("../../../app-size-report.json", import.meta.url);
const guides = new URL("../src/content/docs/guides/", import.meta.url);
const indexPage = new URL("../src/content/docs/index.mdx", import.meta.url);

const START = "<!-- size-report:start -->";
const END = "<!-- size-report:end -->";
const APP_START = "<!-- app-size-report:start -->";
const APP_END = "<!-- app-size-report:end -->";

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

const appRows = ["WalletConnect", "WalletConnect + AppKit", "Konekt", "Konekt + UI"];

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

const appCitations = {
  "bundle-size.md": [
    "konektFirst",
    "konektOverall",
    "wcFirst",
    "wcOverall",
    "appkitFirst",
    "appkitOverall",
    "konektUiFirst",
    "konektUiOverall",
    "headlessFirstPct",
    "headlessOverallPct",
    "uiFirstPct",
    "uiOverallPct",
  ],
  "why-konekt.md": [
    "konektFirst",
    "konektOverall",
    "wcFirst",
    "wcOverall",
    "appkitFirst",
    "appkitOverall",
    "konektUiFirst",
    "konektUiOverall",
    "headlessFirstPct",
    "headlessOverallPct",
    "uiFirstPct",
    "uiOverallPct",
  ],
  "konekt-ui.md": ["konektUiFirst", "konektUiOverall", "appkitFirst", "appkitOverall", "uiFirstPct", "uiOverallPct"],
  "getting-started.md": ["konektFirst", "wcFirst"],
};

// Round on bytes: (2955 / 1000).toFixed(2) is "2.95" because 2.955 is not exact in binary.
const format = (bytes) => (bytes < 1000 ? `${bytes} B` : `${(Math.round(bytes / 10) / 100).toFixed(2)} kB`);

const smaller = (base, current) => `${((1 - current / base) * 100).toFixed(1)}%`;

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

const apps = new Map(JSON.parse(await readFile(appReport, "utf8")).apps.map((app) => [app.name, app]));
const appOf = (name) => {
  const app = apps.get(name);
  if (!app) throw new Error(`app-size-report.json has no app named "${name}". Run pnpm size:apps:update.`);
  return app;
};

const walletconnect = appOf("WalletConnect");
const appkit = appOf("WalletConnect + AppKit");
const konekt = appOf("Konekt");
const konektUi = appOf("Konekt + UI");

const appFigures = {
  konektFirst: format(konekt.firstLoad.gzip),
  konektOverall: format(konekt.overall.gzip),
  wcFirst: format(walletconnect.firstLoad.gzip),
  wcOverall: format(walletconnect.overall.gzip),
  appkitFirst: format(appkit.firstLoad.gzip),
  appkitOverall: format(appkit.overall.gzip),
  konektUiFirst: format(konektUi.firstLoad.gzip),
  konektUiOverall: format(konektUi.overall.gzip),
  headlessFirstPct: smaller(walletconnect.firstLoad.gzip, konekt.firstLoad.gzip),
  headlessOverallPct: smaller(walletconnect.overall.gzip, konekt.overall.gzip),
  uiFirstPct: smaller(appkit.firstLoad.gzip, konektUi.firstLoad.gzip),
  uiOverallPct: smaller(appkit.overall.gzip, konektUi.overall.gzip),
};

const appTable = [
  "| App | First load | Overall |",
  "| --- | ---: | ---: |",
  ...appRows.map((name) => {
    const app = appOf(name);
    return `| ${name} | ${format(app.firstLoad.gzip)} | ${format(app.overall.gzip)} |`;
  }),
].join("\n");

function replaceMarked(source, file, startMark, endMark, body) {
  const start = source.indexOf(startMark);
  const end = source.indexOf(endMark);
  if (start === -1 || end === -1) throw new Error(`${file} is missing the ${startMark} / ${endMark} markers.`);
  return `${source.slice(0, start + startMark.length)}\n\n${body}\n\n${source.slice(end)}`;
}

const guide = new URL("bundle-size.md", guides);
const source = await readFile(guide, "utf8");
const withLibrary = replaceMarked(source, "bundle-size.md", START, END, table);
const withApps = replaceMarked(withLibrary, "bundle-size.md", APP_START, APP_END, appTable);
if (withApps !== source) await writeFile(guide, withApps);

const stale = [];
for (const [file, keys] of Object.entries(citations)) {
  const text = await readFile(new URL(file, guides), "utf8");
  for (const key of keys) {
    const expected = format(sums[key]);
    if (!text.includes(expected)) stale.push(`${file} should quote the ${key} total as ${expected}`);
  }
}

for (const [file, keys] of Object.entries(appCitations)) {
  const text = await readFile(new URL(file, guides), "utf8");
  for (const key of keys) {
    const expected = appFigures[key];
    if (!text.includes(expected)) stale.push(`${file} should quote the ${key} app figure as ${expected}`);
  }
}

const indexText = await readFile(indexPage, "utf8");
for (const key of ["konektFirst", "wcFirst", "appkitFirst"]) {
  if (!indexText.includes(appFigures[key])) {
    stale.push(`index.mdx should quote the ${key} app figure as ${appFigures[key]}`);
  }
}

if (stale.length > 0) {
  throw new Error(`Bundle sizes changed and the guides still quote the old totals:\n${stale.join("\n")}`);
}
