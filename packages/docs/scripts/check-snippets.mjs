import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packages = new URL("../../", import.meta.url);
const docsRoot = new URL("../", import.meta.url);
const content = new URL("src/content/docs/", docsRoot);
const generated = new URL(".snippets/", docsRoot);
const globals = new URL("snippet-globals.d.ts", import.meta.url);

const checkedLanguages = new Set(["ts", "tsx"]);
const resolvedModules = /^(react|node:)/;

async function contentFiles(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (directory.href === content.href && entry.name === "api") continue;
      files.push(...(await contentFiles(new URL(`${entry.name}/`, directory))));
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) {
      files.push(new URL(entry.name, directory));
    }
  }

  return files.sort((a, b) => a.href.localeCompare(b.href));
}

function codeBlocks(source) {
  const lines = source.split("\n");
  const blocks = [];
  let open;

  for (const [index, line] of lines.entries()) {
    if (open) {
      if (/^```\s*$/.test(line)) {
        blocks.push({ ...open, code: lines.slice(open.start, index).join("\n") });
        open = undefined;
      }
      continue;
    }

    const fence = /^```(\S+)(.*)$/.exec(line);
    if (fence) open = { language: fence[1], meta: fence[2], start: index + 1 };
  }

  return blocks;
}

async function entryPointPaths(name) {
  const manifest = JSON.parse(await readFile(new URL(`${name}/package.json`, packages), "utf8"));
  const paths = {};

  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const types = typeof target === "object" ? target.types : undefined;
    if (!types) continue;
    const source = types.replace("./dist/", `../${name}/src/`).replace(/\.d\.ts$/, ".ts");
    paths[subpath === "." ? name : `${name}/${subpath.slice(2)}`] = [source];
  }

  return paths;
}

/** Rewrites a relative import so a generated declaration can stand in for the application file. */
function importedModule(specifier) {
  return specifier.startsWith(".") ? `app:${specifier.replace(/^\.{1,2}\//, "")}` : specifier;
}

function bindingNames(name, into) {
  if (ts.isIdentifier(name)) into.add(name.text);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bindingNames(element.name, into);
  return into;
}

function dynamicImports(parsed, found) {
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;
      if (specifier && ts.isStringLiteral(specifier)) found.push(specifier);
    }
    ts.forEachChild(node, visit);
  };

  visit(parsed);
  return found;
}

function parseBlock(code) {
  const parsed = ts.createSourceFile("block.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const imports = [];
  const declared = new Set();
  const rewrites = [];
  let body = code;

  for (const statement of parsed.statements) {
    if (ts.isImportDeclaration(statement)) {
      imports.push({ module: importedModule(statement.moduleSpecifier.text), clause: statement.importClause });
      rewrites.push({ start: statement.getStart(parsed), end: statement.end, text: undefined });
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) bindingNames(declaration.name, declared);
    } else if (statement.name && ts.isIdentifier(statement.name)) {
      declared.add(statement.name.text);
    }
  }

  for (const specifier of dynamicImports(parsed, [])) {
    const module = importedModule(specifier.text);
    if (module === specifier.text) continue;
    imports.push({ module, clause: undefined, dynamic: true });
    rewrites.push({ start: specifier.getStart(parsed), end: specifier.end, text: `"${module}"` });
  }

  for (const { start, end, text } of rewrites.sort((a, b) => b.start - a.start)) {
    const replacement = text ?? code.slice(start, end).replace(/[^\n]/g, " ");
    body = `${body.slice(0, start)}${replacement}${body.slice(end)}`;
  }

  return { imports, declared, body };
}

/** Collects every binding a guide imports, so any of its samples can use them without repeating imports. */
function guideImports(blocks) {
  const modules = new Map();

  for (const block of blocks) {
    for (const { module, clause } of block.imports) {
      const entry = modules.get(module) ?? { defaults: new Set(), namespaces: new Set(), named: new Map() };
      modules.set(module, entry);

      if (!clause) continue;
      if (clause.name) entry.defaults.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        entry.namespaces.add(clause.namedBindings.name.text);
      }
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          const local = element.name.text;
          const typeOnly = (clause.isTypeOnly || element.isTypeOnly) && entry.named.get(local)?.typeOnly !== false;
          entry.named.set(local, { imported: element.propertyName?.text ?? local, typeOnly });
        }
      }
    }
  }

  return modules;
}

function importsFor(block, modules) {
  const taken = new Set();
  const usable = (name) => {
    if (taken.has(name) || block.declared.has(name) || !new RegExp(`\\b${name}\\b`).test(block.body)) return false;
    taken.add(name);
    return true;
  };
  const statements = [];

  for (const { module, clause, dynamic } of block.imports) {
    if (!clause && !dynamic) statements.push(`import "${module}";`);
  }

  for (const [module, entry] of modules) {
    for (const namespace of entry.namespaces) {
      if (usable(namespace)) statements.push(`import * as ${namespace} from "${module}";`);
    }

    const bindings = [...entry.named]
      .filter(([local]) => usable(local))
      .map(([local, { imported, typeOnly }]) => {
        const binding = imported === local ? local : `${imported} as ${local}`;
        return typeOnly ? `type ${binding}` : binding;
      });
    const clause = [[...entry.defaults].filter(usable), bindings.length > 0 ? `{ ${bindings.join(", ")} }` : ""]
      .flat()
      .filter(Boolean)
      .join(", ");

    if (clause) statements.push(`import ${clause} from "${module}";`);
  }

  return statements;
}

/** Stands in for third-party packages so samples type-check without installing every integration. */
function externalDeclarations(modules) {
  const declarations = [];

  for (const [module, entry] of [...modules].sort(([a], [b]) => a.localeCompare(b))) {
    if (module.startsWith("app:") || entry.namespaces.size > 0) {
      declarations.push(`declare module "${module}";`);
      continue;
    }

    const exported = new Set([...entry.named.values()].map(({ imported }) => imported));
    const members = [...exported].flatMap((name) => [
      `  export const ${name}: any;`,
      `  export type ${name}<A = any, B = any, C = any> = any;`,
    ]);
    const body = [...members, "  const fallback: any;", "  export default fallback;"];

    declarations.push([`declare module "${module}" {`, ...body, "}"].join("\n"));
  }

  return declarations.join("\n");
}

const externals = new Map();
const snippets = [];

for (const file of await contentFiles(content)) {
  const documentation = file.pathname.slice(content.pathname.length);
  const blocks = codeBlocks(await readFile(file, "utf8"))
    .filter((block) => checkedLanguages.has(block.language) && !/\bignore\b/.test(block.meta))
    .map((block) => ({ ...block, ...parseBlock(block.code) }));
  if (blocks.length === 0) continue;

  const modules = guideImports(blocks);

  for (const [module, entry] of modules) {
    if (module.startsWith("konekt") || resolvedModules.test(module)) continue;
    const shared = externals.get(module) ?? { defaults: new Set(), namespaces: new Set(), named: new Map() };
    for (const name of entry.defaults) shared.defaults.add(name);
    for (const name of entry.namespaces) shared.namespaces.add(name);
    for (const [local, binding] of entry.named) shared.named.set(local, binding);
    externals.set(module, shared);
  }

  for (const [index, block] of blocks.entries()) {
    const header = [`// generated from ${documentation}:${block.start + 1}`, ...importsFor(block, modules)];
    const lines = [...header, ...block.body.split("\n"), "export {};"];
    const sources = [...header.map(() => 0), ...block.body.split("\n").map((_, line) => block.start + 1 + line), 0];

    snippets.push({
      documentation,
      file: new URL(`${documentation.replace(/[/\\]/g, "__").replace(/\.mdx?$/, "")}.${index}.tsx`, generated),
      text: `${lines.join("\n")}\n`,
      sources,
    });
  }
}

const paths = { ...(await entryPointPaths("konekt")), ...(await entryPointPaths("konekt-ui")) };

await rm(generated, { recursive: true, force: true });
await mkdir(generated, { recursive: true });
await writeFile(new URL("externals.d.ts", generated), `${externalDeclarations(externals)}\n`);
await Promise.all(snippets.map(({ file, text }) => writeFile(file, text)));

const program = ts.createProgram({
  rootNames: [
    fileURLToPath(new URL("externals.d.ts", generated)),
    fileURLToPath(globals),
    ...snippets.map(({ file }) => fileURLToPath(file)),
  ],
  options: {
    allowImportingTsExtensions: true,
    baseUrl: fileURLToPath(docsRoot),
    jsx: ts.JsxEmit.ReactJSX,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    paths,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
    types: [],
  },
});

const byFile = new Map(snippets.map((snippet) => [fileURLToPath(snippet.file), snippet]));
const failures = [];

for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
  const snippet = diagnostic.file && byFile.get(diagnostic.file.fileName);
  if (!snippet || diagnostic.start === undefined) continue;

  const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  failures.push(`${snippet.documentation}:${snippet.sources[line] ?? 0} TS${diagnostic.code}: ${message}`);
}

if (failures.length > 0) {
  throw new Error(
    [
      "Documentation code samples do not compile.",
      "Mark a sample with `ignore` after its language tag when it is deliberately partial.",
      `Generated modules: ${fileURLToPath(generated)}`,
      "",
      ...failures,
    ].join("\n"),
  );
}

await rm(generated, { recursive: true, force: true });
