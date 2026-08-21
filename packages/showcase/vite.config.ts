import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same Pages layout as packages/docs: the workflow copies this build into the docs site under
// /showcase/, so assets must resolve under the repo base path.
const pages = process.env.GITHUB_ACTIONS === "true";
const owner = process.env.GITHUB_REPOSITORY_OWNER ?? "localhost";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "konekt";
const isUserSite = repo === `${owner}.github.io`;
const base = pages ? (isUserSite ? "/showcase/" : `/${repo}/showcase/`) : "/";

const UNINFORMATIVE = new Set([
  "_esm",
  "browser",
  "build",
  "bundle",
  "cjs",
  "dist",
  "esm",
  "exports",
  "index",
  "lib",
  "main",
  "module",
  "node",
  "property",
  "src",
]);

function packageOf(moduleId: string): string | undefined {
  const marker = "node_modules/";
  const start = moduleId.lastIndexOf(marker);
  if (start === -1) return undefined;

  const segments = moduleId.slice(start + marker.length).split("/");
  const name = segments[0].startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];

  return name.replace(/^@/, "").replace(/\//g, "-");
}

function dominantPackage(moduleIds: readonly string[]): string | undefined {
  const counts = new Map<string, number>();

  for (const id of moduleIds) {
    const name = packageOf(id);
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  let winner: string | undefined;
  let winningCount = 0;
  for (const [name, count] of counts) {
    if (count > winningCount) {
      winner = name;
      winningCount = count;
    }
  }

  return winner;
}

export default defineConfig({
  base,
  plugins: [react()],
  // One .env at the workspace root, shared with the test suite. The prefix list names the variable
  // outright rather than opening all of WC_*, so a future secret there does not reach the bundle.
  envDir: "../..",
  envPrefix: ["VITE_", "WC_PROJECT_ID"],
  server: { port: 5174 },
  preview: { port: 4174 },
  define: {
    "process.env.WC_DEBUG": JSON.stringify(process.env.WC_DEBUG ?? ""),
  },
  optimizeDeps: {
    exclude: ["konekt"],
  },
  build: {
    sourcemap: true,
    rolldownOptions: {
      output: {
        chunkFileNames(chunk) {
          const stem = chunk.name.split(".")[0].toLowerCase();
          if (!UNINFORMATIVE.has(stem)) return "assets/[name]-[hash].js";

          const pkg = dominantPackage(chunk.moduleIds);
          return pkg ? `assets/${pkg}-[hash].js` : "assets/[name]-[hash].js";
        },
      },
    },
  },
});
