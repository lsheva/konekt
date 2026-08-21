import { spawnSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const reportPath = "app-size-report.json";
const root = fileURLToPath(new URL("../", import.meta.url));
const reportUrl = new URL("../app-size-report.json", import.meta.url);
const commentUrl = new URL("../.app-size-comment.md", import.meta.url);
const update = process.argv.includes("--update");

const apps = [
  {
    name: "WalletConnect",
    package: "size-walletconnect",
    stack: ["@walletconnect/ethereum-provider"],
  },
  {
    name: "WalletConnect + AppKit",
    package: "size-appkit",
    stack: ["@reown/appkit", "@reown/appkit-adapter-ethers", "ethers"],
  },
  {
    name: "Konekt",
    package: "size-konekt",
    stack: ["konekt"],
  },
  {
    name: "Konekt + UI",
    package: "size-konekt-ui",
    stack: ["konekt", "konekt-ui"],
  },
];

const ASSET = /\.(?:js|mjs|css|wasm|woff2?)$/;

function run(command, args) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

function attr(attrs, name) {
  return new RegExp(`(?:^|\\s)${name}=["']([^"']+)["']`, "i").exec(attrs)?.[1];
}

function hrefsFromHtml(html) {
  const hrefs = [];
  for (const tag of html.matchAll(/<(script|link)\b([^>]*)>/gi)) {
    const name = tag[1].toLowerCase();
    const tagAttrs = tag[2];
    const rel = attr(tagAttrs, "rel")?.toLowerCase();
    const href = attr(tagAttrs, name === "script" ? "src" : "href");
    if (!href || /^(?:data:|https?:|\/\/)/i.test(href)) continue;
    if (name === "script" || rel === "stylesheet" || rel === "modulepreload") hrefs.push(href);
  }
  return hrefs;
}

function resolveHref(distDir, href) {
  return join(distDir, href.replace(/^[./]+/, ""));
}

async function walkAssets(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".vite") continue;
      files.push(...(await walkAssets(path)));
    } else if (ASSET.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

function gzipSize(buffer) {
  return gzipSync(buffer, { level: 9 }).length;
}

async function measureFiles(paths) {
  let raw = 0;
  let gzip = 0;
  for (const path of paths) {
    const buffer = await readFile(path);
    raw += buffer.length;
    gzip += gzipSize(buffer);
  }
  return { raw, gzip };
}

function formatBytes(bytes) {
  if (bytes >= 1000) return `${(Math.round(bytes / 10) / 100).toFixed(2)} kB`;
  return `${bytes} B`;
}

function smaller(base, current) {
  if (base === 0) return "n/a";
  return `${((1 - current / base) * 100).toFixed(1)}% smaller`;
}

function parseReport(text) {
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || !Array.isArray(value.apps)) {
    throw new Error("App size report must be an object with an apps array");
  }
  return value;
}

async function readCommittedReport() {
  try {
    return parseReport(await readFile(reportUrl, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function resolveVersion(appDir, name, declared) {
  if (typeof declared !== "string") throw new Error(`${appDir} is missing dependency ${name}`);
  if (declared.startsWith("workspace:")) {
    const local = JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8"));
    return local.version;
  }
  try {
    const installed = JSON.parse(await readFile(join(appDir, "node_modules", name, "package.json"), "utf8"));
    return installed.version;
  } catch {
    return declared;
  }
}

async function versionsOf(appDir, pkg, names) {
  return Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await resolveVersion(appDir, name, pkg.dependencies[name])])),
  );
}

async function measureApp(app) {
  const appDir = join(root, "packages", app.package);
  const distDir = join(appDir, "dist");
  const pkg = JSON.parse(await readFile(join(appDir, "package.json"), "utf8"));
  const html = await readFile(join(distDir, "index.html"), "utf8");
  const firstLoadPaths = [...new Set(hrefsFromHtml(html).map((href) => resolveHref(distDir, href)))].sort();
  const overallPaths = await walkAssets(distDir);
  return {
    name: app.name,
    package: app.package,
    versions: await versionsOf(appDir, pkg, app.stack),
    firstLoad: await measureFiles(firstLoadPaths),
    overall: await measureFiles(overallPaths),
  };
}

function markdown(current) {
  const byName = new Map(current.apps.map((app) => [app.name, app]));
  const walletconnect = byName.get("WalletConnect");
  const appkit = byName.get("WalletConnect + AppKit");
  const konekt = byName.get("Konekt");
  const konektUi = byName.get("Konekt + UI");
  const lines = [
    "## Production app bundle size",
    "",
    "Vite production builds of four matched React apps. First load is JavaScript and CSS the HTML requests up front. Overall is every JS, CSS, WASM, and font file in `dist`. Sizes are minified and gzipped per file.",
    "",
    "| App | First load | Overall |",
    "| --- | ---: | ---: |",
  ];

  for (const app of current.apps) {
    lines.push(`| ${app.name} | ${formatBytes(app.firstLoad.gzip)} | ${formatBytes(app.overall.gzip)} |`);
  }

  if (walletconnect && konekt) {
    lines.push(
      "",
      `Headless Konekt is **${smaller(walletconnect.firstLoad.gzip, konekt.firstLoad.gzip)}** on first load and **${smaller(walletconnect.overall.gzip, konekt.overall.gzip)}** overall than \`@walletconnect/ethereum-provider\`.`,
    );
  }
  if (appkit && konektUi) {
    lines.push(
      `Konekt with UI is **${smaller(appkit.firstLoad.gzip, konektUi.firstLoad.gzip)}** on first load and **${smaller(appkit.overall.gzip, konektUi.overall.gzip)}** overall than AppKit.`,
    );
  }

  return `${lines.join("\n")}\n`;
}

for (const app of apps) {
  const result = run("pnpm", ["--filter", app.package, "build"]);
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

const current = { apps: await Promise.all(apps.map(measureApp)) };
const committed = await readCommittedReport();
const stale = JSON.stringify(committed) !== JSON.stringify(current);

if (update) {
  await writeFile(reportUrl, `${JSON.stringify(current, null, 2)}\n`);
}

const body = markdown(current);
process.stdout.write(body);
if (stale && !update) {
  process.stdout.write(
    `\nThe committed report is stale. Run \`pnpm size:apps:update\` and commit \`${reportPath}\`.\n`,
  );
}

await writeFile(commentUrl, body);

if (stale && !update) process.exit(1);
