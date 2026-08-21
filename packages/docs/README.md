# docs

The documentation site at [lsheva.github.io/konekt](https://lsheva.github.io/konekt/). Astro with
Starlight, deployed to GitHub Pages by `.github/workflows/docs.yml`.

```sh
pnpm dev:docs        # from the repository root
pnpm docs:build
```

## How it is assembled

- `src/content/docs/guides/` holds the handwritten guides.
- The API reference is generated from the `konekt` and `konekt-ui` sources by `starlight-typedoc`,
  from the barrel list in `astro.config.ts`. Do not edit `src/content/docs/api/`.
- `starlight-llms-txt` produces `/llms.txt` and `/llms-full.txt` for coding agents.

Three scripts run before every dev, build, and typecheck:

| Script | What it does |
| --- | --- |
| `sync:skills` | Copies each package's `SKILL.md` into `public/skills/` so agents can fetch them. |
| `sync:sizes` | Regenerates the measured tables in `guides/bundle-size.md` from `size-report.json` and `app-size-report.json`, and fails if a guide quotes a stale derived total. |
| `check:links` | Fails on root-relative links, which break under the GitHub Pages base path, and on relative links that point at no page. |
| `check:snippets` | Type-checks every `ts` and `tsx` sample against the `konekt` and `konekt-ui` sources. |

If `sync:sizes` fails, the bundle measurements changed. Run `pnpm size:update` and `pnpm size:apps:update` at the root, then update the prose figure it names.

## Writing guides

- Use relative links (`../chains/`), never root-relative (`/guides/chains/`). The site is served
  from a base path on GitHub Pages.
- Quote library sizes from `size-report.json` and Vite app sizes from `app-size-report.json` rather
  than by hand.

## How samples are type-checked

`pnpm check:snippets` compiles every `ts` and `tsx` block as its own module, against the library
sources rather than the published types, so a renamed export or a changed option fails the check.

- A sample may use any import that appears anywhere in the same guide, so a follow-up sample does
  not have to repeat the import block.
- `scripts/snippet-globals.d.ts` declares the shared vocabulary — `provider`, `projectId`,
  `metadata`, `renderQrCode`, and the rest — that samples may use without declaring it. Add a name
  there when several guides need the same placeholder; declare it in the sample when only one does.
- Third-party packages are stubbed, so viem, wagmi, and CosmJS values are `any`. Sample code that
  only exercises those is checked for syntax, not for their APIs.
- Mark a deliberately partial sample with `ignore` after the language tag: <code>```tsx ignore</code>.
  Use it for JSX fragments and before-and-after comparisons, not to silence a real failure.
