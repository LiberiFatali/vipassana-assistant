## Context

The repository is a Node.js (ESM, `"type": "module"`, engines `>=20`) Vercel app. Today the only CI is `.github/workflows/deploy.yml`, which runs a `test` job (`npm test`) on push-to-main and every PR, then deploys to Vercel. There is no linter, no `lint` script, and no lint config anywhere in the repo. `README.md` is 127 lines and duplicates architecture and env details that `AGENTS.md` already owns.

## Goals / Non-Goals

**Goals:**
- Every PR targeting `main` runs unit tests and lint before merge; `main` stays tested on direct pushes.
- No duplicate test runs between the new CI and the deploy workflow.
- ESLint setup that is minimal, flat-config based, and passes on the first run without large code churn.
- A README that a human can read in ~30 seconds and that stops going stale.

**Non-Goals:**
- Enforcing style beyond ESLint's recommended set (no Prettier, no TypeScript).
- Adding coverage reporting or other PR checks.
- Changing deploy behavior, runtime code, or the public API.

## Decisions

### ESLint: flat config, `@eslint/js` recommended + `globals`
Use ESLint 9 flat config (`eslint.config.js`, ESM) with `@eslint/js` recommended rules, `sourceType: "module"`, `ecmaVersion: "latest"`, Node globals for all files plus browser globals for `public/**` (the client-side markdown renderer), and ignores for `node_modules`, `.vercel`, and generated files.
- *Why flat config over legacy `.eslintrc`?* ESLint 9 is current; flat config is the only supported form going forward.
- *Why `@eslint/js` recommended over a stricter/shared config?* Recommended is widely trusted and minimal; the repo has no framework to lint against.
- *Alternative considered:* Prettier for formatting — rejected as out of scope (Non-Goals).
- If recommended rules fire on intentional code (e.g. `console` in server/dev code), relax specific rules in `eslint.config.js` rather than churning the codebase. Rule overrides stay file-scoped where possible.

### Separate `ci.yml` instead of folding lint into `deploy.yml`
Create `.github/workflows/ci.yml` with a single job (`checkout@v7`, `setup-node@v7` node 20 with `cache: npm`, `npm ci`, `npm test`, `npm run lint`) triggered on `pull_request: branches: [main]` and `push: branches: [main]`.
- *Why separate from deploy?* CI (quality gate) and deploy (delivery) have different concerns and trigger sets; deploy.yml's Vercel step doesn't need lint, and CI shouldn't need a Vercel token.
- *Why single job vs split test/lint jobs?* One `npm ci` for both steps is faster; failure of either fails the job.
- *Why also on push to main?* The existing deploy workflow's `test` job currently gates pushes; removing it must not leave `main` untested.

### Deduplicate `deploy.yml`
Remove the `test` job (lines with `name: Test`) and the `needs: test` reference on the deploy job. Deploy behavior (prod on push, preview on PR, preview URL comment) is unchanged. Tests for PRs and pushes now come exclusively from `ci.yml`.

### README: rewrite, don't accumulate
Rewrite `README.md` to ~50-60 lines: pitch → features (condensed bullets) → requirements → quick start → run locally → test & lint → deploy → security summary → link to `AGENTS.md`. Strip the file-tree listing, per-file test descriptions, verbose env-var blocks, and provider/model specifics; keep the `project-hygiene` "setup docs match layout" contract intact (every command referenced stays real).

## Risks / Trade-offs

- [First ESLint run surfaces many violations] → Mitigation: prefer rule relaxations in `eslint.config.js` for intentional patterns; fix only genuine bugs/obvious issues; keep the diff small.
- [ci.yml duplicates some of deploy.yml's setup steps] → Mitigation: acceptable duplication of 3 standard actions; keeping them separate preserves clear job ownership.
- [New workflow won't run on already-open PRs] → Mitigation: note in the PR/commit that the check activates on the next PR.
- [README loses useful detail for contributors] → Mitigation: `AGENTS.md` is the canonical home for that detail and already linked from the README top.

## Migration Plan

1. Add ESLint devDependencies and config, add `lint` script; fix or relax until `npm run lint` is green.
2. Add `.github/workflows/ci.yml`.
3. Remove the `test` job from `.github/workflows/deploy.yml`.
4. Rewrite `README.md`.
5. Run `npm test` and `npm run lint` locally; confirm `find api -name '*.js'` still returns exactly `api/chat.js`.
6. No rollback complexity: all changes are additive or README/textual; reverting the workflow/README commits restores prior state.

## Open Questions

None.
