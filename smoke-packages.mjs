import { access, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const entries = [
  "packages/konekt/dist/index.js",
  "packages/konekt/dist/chains/eip155.js",
  "packages/konekt/dist/chains/solana.js",
  "packages/konekt/dist/chains/bip122.js",
  "packages/konekt/dist/chains/cosmos.js",
  "packages/konekt/dist/chains/generic.js",
  "packages/konekt/dist/features/siwe.js",
  "packages/konekt/dist/features/cacao.js",
  "packages/konekt/dist/http.js",
  "packages/konekt-ui/dist/index.js",
  "packages/konekt-ui/dist/wagmi/index.js",
];

for (const entry of entries) {
  await import(pathToFileURL(resolve(root, entry)).href);
}

await access(resolve(root, "packages/konekt-ui/dist/styles.css"));

for (const packageName of ["konekt", "konekt-ui"]) {
  const dist = resolve(root, "packages", packageName, "dist");
  const files = await readdir(dist, { recursive: true });
  for (const file of files) {
    if (!file.endsWith(".map")) continue;
    const mapPath = resolve(dist, file);
    const map = JSON.parse(await readFile(mapPath, "utf8"));
    for (const source of map.sources) {
      await access(resolve(dirname(mapPath), map.sourceRoot ?? "", source));
    }
  }
}
