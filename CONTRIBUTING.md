# Contributing

Thanks for helping improve konekt. This document covers the setup, the checks your change must pass,
and the conventions the codebase follows.

## Setup

Requires Node 24 and pnpm 10.

```sh
pnpm install
cp .env.example .env   # add a WalletConnect project id
```

`WC_PROJECT_ID` is needed for the example apps and the interop tests, which open a real relay socket.
The unit tests run without it.

```sh
pnpm dev              # example app on :5173
pnpm dev:showcase     # capabilities lab on :5174
pnpm dev:docs         # documentation site on :4321
```

## Before opening a pull request

```sh
pnpm check
```

That runs Biome, the tests, the package builds, type checking across every workspace, an ESM import
smoke test, `publint`, `@arethetypeswrong/cli`, the Vite example builds, and the size budgets. CI
runs the same thing, so a green `pnpm check` locally means a green CI.

Narrower commands while iterating:

```sh
pnpm lint
pnpm test
pnpm typecheck
pnpm size             # measured bundle sizes against .size-limit.mts
pnpm check:snippets   # type-check the code samples in the docs
```

### Changesets

Any change to published behavior in `konekt` or `konekt-ui` needs a changeset:

```sh
pnpm changeset
```

Pick the affected packages, choose `patch`, `minor`, or `major`, and describe the change from a
consumer's point of view. Documentation, tests, and internal tooling do not need one. See
[RELEASING.md](RELEASING.md) for what happens after merge.

### Bundle sizes

If you change published code or CSS, refresh the measured report and commit it:

```sh
pnpm size:update
git add size-report.json
```

The documentation table is generated from that file, so also run `pnpm --filter docs sync` and update
any prose figure the script names as stale.

## Code conventions

The repository has a strong architectural point of view, recorded in [AGENTS.md](AGENTS.md). Read it
before adding an API. The parts contributors hit most often:

- **Names and structure over comments.** A comment should record a constraint the code cannot show,
  not narrate what the next line does.
- **No wrapper APIs.** Do not add a function whose only job is to forward to an existing one.
- **Put a helper next to its concern**, not in the composer. AGENTS.md has the file-by-file table.
- **The kernel does not import chain adapters or `konekt/http`.** Entry points are the bundle
  boundary, and breaking one costs every consumer bytes.
- **No `!` to satisfy the type checker.** Narrow, return early, or widen the helper to the data it
  actually reads. `exactOptionalPropertyTypes` is on.
- **Named constants over magic numbers**, and errors that say what is missing and what to do.

TypeScript is strict, and Biome handles formatting and linting. Run `pnpm format` to apply it.

## Tests

Tests live in each package's `test/` directory and run on the Node test runner.

- Unit and protocol-shape tests need no network. Inject a fake with
  `Provider.create(opts, { session })`, which keeps the provider offline.
- Interop tests that open a real relay socket are skipped without `WC_PROJECT_ID`.
- Testing wallet behavior is not the same as testing the protocol shape. A bridge test proves the
  encoding; only a real wallet proves the wallet.

## Documentation

Guides are in `packages/docs/src/content/docs/guides/`. The API reference is generated from source
doc comments, so fix those rather than editing `src/content/docs/api/`.

Code samples in guides are type-checked. Keep them pastable: declare every identifier a sample uses,
and do not redeclare a name earlier in the same page. See
[packages/docs/README.md](packages/docs/README.md).

## Reporting bugs

Open an issue with the Konekt version, the wallet and its version, `onDebug` output where relevant,
and a minimal reproduction. For anything with a security impact, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.
