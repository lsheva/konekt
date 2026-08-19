import { readdir, readFile } from "node:fs/promises";

const docs = new URL("../src/content/docs/", import.meta.url);
const rootRelativeLink = /\]\(\/(?!\/)|\bhref=(["'])\/(?!\/)|^\s*link:\s*\/(?!\/)/;

async function contentFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      if (directory.href === docs.href && entry.name === "api") continue;
      files.push(...(await contentFiles(new URL(`${entry.name}/`, directory))));
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) {
      files.push(url);
    }
  }

  return files;
}

const failures = [];
for (const file of await contentFiles(docs)) {
  const lines = (await readFile(file, "utf8")).split("\n");
  for (const [index, line] of lines.entries()) {
    if (rootRelativeLink.test(line)) {
      failures.push(`${file.pathname.slice(docs.pathname.length)}:${index + 1}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Root-relative documentation links escape the GitHub Pages base path:\n${failures.join("\n")}`);
}
