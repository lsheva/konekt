import { spawnSync } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const reportPath = "size-report.json";
const root = new URL("../", import.meta.url);
const reportUrl = new URL(reportPath, root);
const commentUrl = new URL(".size-limit-comment.md", root);
const update = process.argv.includes("--update");

function run(command, args) {
  return spawnSync(command, args, {
    cwd: fileURLToPath(root),
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
}

function normalize(results) {
  return results.map(({ name, size, sizeLimit }) => ({
    name,
    size,
    limit: sizeLimit,
  }));
}

function parseReport(text) {
  const value = JSON.parse(text);
  if (!Array.isArray(value)) throw new Error("Size report must be an array");
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

function readBaseReport(ref) {
  if (!ref) return undefined;
  const result = run("git", ["show", `${ref}:${reportPath}`]);
  if (result.status !== 0) return undefined;
  return parseReport(result.stdout);
}

function formatBytes(bytes) {
  if (bytes >= 1000) return `${(bytes / 1000).toFixed(2)} kB`;
  return `${bytes} B`;
}

function formatDelta(before, after) {
  if (before === undefined) return "new";
  if (after === undefined) return "removed";
  const delta = after - before;
  const sign = delta > 0 ? "+" : "";
  const percent = before === 0 ? "new" : `${sign}${((delta / before) * 100).toFixed(2)}%`;
  return `${sign}${formatBytes(delta)} (${percent})`;
}

function markdown(base, current, stale, overBudget) {
  const previous = new Map((base ?? []).map((entry) => [entry.name, entry]));
  const next = new Map(current.map((entry) => [entry.name, entry]));
  const names = [...new Set([...previous.keys(), ...next.keys()])];
  const lines = [
    "## Size Limit report",
    "",
    "| Entry | Current | Change | Limit | Headroom |",
    "| --- | ---: | ---: | ---: | ---: |",
  ];

  for (const name of names) {
    const before = previous.get(name);
    const after = next.get(name);
    lines.push(
      `| ${name} | ${after ? formatBytes(after.size) : "—"} | ${formatDelta(before?.size, after?.size)} | ${
        after ? formatBytes(after.limit) : "—"
      } | ${after ? formatBytes(after.limit - after.size) : "—"} |`,
    );
  }

  if (!base) lines.push("", "Initial committed baseline; no base-branch report was available.");
  if (stale) lines.push("", "The committed report is stale. Run `pnpm size:update` and commit `size-report.json`.");
  if (overBudget) lines.push("", "At least one entry exceeds its absolute Size Limit budget.");
  return `${lines.join("\n")}\n`;
}

const sizeLimit = run("pnpm", ["exec", "size-limit", "--json"]);
if (!sizeLimit.stdout.trim()) {
  process.stderr.write(sizeLimit.stderr);
  process.exit(sizeLimit.status ?? 1);
}

const current = normalize(JSON.parse(sizeLimit.stdout));
const committed = await readCommittedReport();
const stale = JSON.stringify(committed) !== JSON.stringify(current);

if (update) {
  await writeFile(reportUrl, `${JSON.stringify(current, null, 2)}\n`);
}

const baseRef = process.env.SIZE_LIMIT_BASE;
const base = readBaseReport(baseRef) ?? (update ? committed : baseRef ? undefined : committed);
const body = markdown(base, current, !update && stale, sizeLimit.status !== 0);
process.stdout.write(body);
await writeFile(commentUrl, body);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, body);
}

if (sizeLimit.stderr) process.stderr.write(sizeLimit.stderr);
if (sizeLimit.status !== 0 || (!update && stale)) process.exit(1);
