# AGENTS.md — StockSharp Grid

Guidance for AI coding agents (and humans) working in this repository,
`@stocksharp/grid`.

## What this is
The browser data grid StockSharp's web applications render their tables with:
`DataGrid` (columns, sorting, pinned rows, export), `TableSort` (the sort state
behind it), `ColumnSettings` (a column picker for a table the server already
rendered) and `TableExport` (a dependency-free `.xlsx` writer). Source in `src/`,
tests in `tests/`. Bundled with esbuild/tsc via `build.mjs`. `dist/` and
`tests/_dist/` are build outputs and are gitignored — never commit them.

## Everyday commands
- `npm run build` — build the ESM tree, the declarations and the browser bundle.
- `npm test` — typecheck + public-API check + unit tests (`node:test`). Run before every commit.

## The library owns no chrome
Everything this package renders is an element it created; it never writes an HTML
string, so it can never be an injection site. Everything it *shows* is the host's:

- **Text** arrives already localized. There is no translator here, and no string
  the package would have to translate — a column's caption, the empty-table text
  and the picker's two tooltips are all arguments.
- **Looks** are class names the caller supplies (`cellClass`, `rowClass`, the
  picker's `classes`). The three exceptions are documented in the README and in
  the header of `src/data-grid.ts`: `grid-empty`, `visually-hidden` and
  `sort-asc`/`sort-desc`. Adding a fourth is a decision, not a detail.
- **Persistence and dialogs** are interfaces (`ColumnLayoutStore`,
  `ColumnSettingsDialog`). Nothing here may reach for `window`, `location`,
  storage or a modal library — the unit tests run in a node process where none of
  those exist, which is what keeps the rule honest.

## The DOM in the tests is a fake, deliberately
`tests/fake-dom.ts` implements the slice of DOM the library touches, and its size
is the statement of how narrow that slice is. Two of its behaviours are
load-bearing rather than approximated: `appendChild` **moves** a node that
already has a parent (this is the whole of how `ColumnSettings` reorders a row),
and `dataset` is a view over `data-*` attributes (the grid writes through one,
the picker reads through the other). When the library starts using a DOM member
the fake lacks, add it there rather than working around it in a test.

## The public API is snapshot-tested
`npm test` runs `api:check`, which compares the exported types against
`tests/api/public-api.d.ts`. If you intentionally change the public API,
regenerate the snapshot with `npm run api:update` and commit it in the same
change — otherwise CI fails.

**Comment private members with `//`, not `/** */`.** The declaration emitter drops
a private member's body but keeps its doc comment, which then attaches to whatever
member comes next — or dangles at the end of the class. Either way the snapshot
changes and `api:check` fails on a change that never touched the public API. When
`api:check` reddens and the diff is a stray comment block, this is why: convert
that comment to `//` rather than regenerating the snapshot, which would bake the
leak in.

## Commits
Use Conventional Commits: `feat:`, `fix:`, `ci:`, `chore:`, `docs:`,
`refactor:`, `test:`, `perf:`. Use `feat!:` or a `BREAKING CHANGE:` footer for
breaking changes. Code comments and commit messages are in English.

## Releasing — read this before touching versions or CI
Publishing is automated and driven by the **version in `package.json`**.

- `.github/workflows/release.yml` runs on every push to `main`, but publishes to
  npm **only when the version in `package.json` is not yet on the registry**. A
  normal push whose version is already published is a no-op.
- **To cut a release**, bump the version and push:
  ```bash
  npm run release:patch   # or release:minor / release:major
  git push
  ```
  `npm run release:*` bumps `package.json` and commits `chore: release vX.Y.Z`
  (it needs a clean working tree, and also creates a *local* git tag `vX.Y.Z` —
  leave it alone: a plain `git push` does not push it, and CI creates the remote
  tag itself). The push to `main` triggers the workflow, which builds, runs the
  full test suite, `npm publish`es, then creates the `vX.Y.Z` tag and GitHub
  Release.
- Version policy: pre-1.0 — `feat` → minor, `fix` → patch. Reserve major for a
  deliberate 1.0.
- **Do not** run `npm publish` locally, and **do not** hand-push tags — CI owns
  publishing and tagging. The tag is an *output* of a release, not its trigger.
- Manual retry (e.g. a flaky test failed a publish): GitHub → Actions →
  **Publish package** → **Run workflow** (optional `ref` input).

## npm authentication — do not break this
Publishing uses **npm trusted publishing (OIDC)** — there is **no `NPM_TOKEN`**.
`release.yml` grants `id-token: write`; npm exchanges the GitHub OIDC token for a
short-lived publish token and signs a provenance attestation
(`publishConfig.provenance` in `package.json`).

Violating any of the following causes `npm error code E404 ... you do not have
permission` on publish:

- **Do not rename `.github/workflows/release.yml`**, and do not move the
  `npm publish` step into a different workflow file. The npm Trusted Publisher is
  bound to the workflow filename `release.yml`; a different filename fails OIDC
  claim matching. If a rename is unavoidable, first update the Trusted Publisher
  at npmjs.com → `@stocksharp/grid` → Settings → Trusted Publisher to the new
  filename.
- **Do not add `NODE_AUTH_TOKEN` / `NPM_TOKEN`** to the publish step or to
  `setup-node`'s auth. A stale or placeholder token shadows the OIDC exchange.
- Keep npm ≥ 11.5.1 and Node ≥ 22.14 in the workflow (currently npm 11.6.2 /
  Node 24) — required for trusted publishing.

## Pushing to main is publishing
Because a version-bumping push to `main` releases a public npm package, treat a
push to `main` as a release action: confirm with the maintainer before pushing,
and make sure the version bump is intended.
