## Why

The repo has no dedicated CI for pull requests beyond the deploy workflow's incidental test job, and no linting at all. Contributors can merge code that fails unit tests or violates basic style. Separately, `README.md` is 127 lines of churn-prone internals (file-tree listing, per-file test breakdowns, provider/model env details) that duplicate `AGENTS.md` and are hard for humans to scan.

## What Changes

- Add ESLint (`eslint` + `@eslint/js` + `globals` as devDependencies) with a flat `eslint.config.js` and an `npm run lint` script.
- Add `.github/workflows/ci.yml` that runs unit tests and linting on pull requests targeting `main` (and on pushes to `main`, so the branch stays gated after the deploy workflow's test job is removed).
- Remove the now-redundant `test` job (and its `needs: test`) from `.github/workflows/deploy.yml`; the deploy job otherwise behaves identically.
- Rewrite `README.md` as a shorter, human-friendly document: pitch, condensed features, quick start, run/test/lint/deploy one-liners, security summary, and a pointer to `AGENTS.md` for architecture. Drop the file-tree listing, per-file test descriptions, verbose env-var blocks, and provider/model specifics.

## Capabilities

### New Capabilities

<!-- None — the change extends an existing capability rather than introducing a new one. -->

### Modified Capabilities

- `project-hygiene`: add a requirement that pull requests targeting `main` run the unit test suite and the linter before merge, and add a requirement that `README.md` stay concise and defer churn-prone internals to `AGENTS.md`.

## Impact

- `package.json` / `package-lock.json` — new devDependencies and `lint` script.
- New file `eslint.config.js`, new workflow `.github/workflows/ci.yml`.
- `.github/workflows/deploy.yml` — `test` job removed.
- `README.md` — rewritten (~50-60 lines).
- No runtime behavior, public API, or data-freshness contract changes.
