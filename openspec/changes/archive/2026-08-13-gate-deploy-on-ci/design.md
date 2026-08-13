## Context

The repo has two GitHub Actions workflows:

- `ci.yml` (name "CI") runs `npm ci` + `npm test` + `npm run lint` on `pull_request`→`main` and `push`→`main`. It only *reports* status — it gates nothing.
- `deploy.yml` (name "Deploy to Vercel") triggers on the same events and deploys unconditionally, in parallel with CI. The deploy job's only guard is a fork check (`github.event_name == 'push' || github.event.pull_request.head.repo.full_name == github.repository`). A direct push to `main` with failing tests still deploys to production.

An archived change (`openspec/changes/archive/2026-08-13-add-pr-ci-and-readable-readme/design.md`) confirms `deploy.yml` previously ran its own `test` job with `needs: test`, removed when `ci.yml` was split out — leaving deploys un-gated.

The chosen approach (per plan) is a **`workflow_run` gate**: deploy only after the CI workflow completes with `conclusion == 'success'`. This keeps `ci.yml` the single source of truth for testing.

## Goals / Non-Goals

**Goals:**
- Production deploys happen only after CI passes on the same commit.
- PR preview deployments (and the preview URL comment) are also gated on CI passing.
- `ci.yml` stays unchanged; deploy.yml no longer runs tests itself.
- Prod-vs-preview and fork-safety semantics preserved.

**Non-Goals:**
- Branch protection settings changes (complementary hardening, out of code scope).
- Introducing other deploy channels or changing the Vercel build/deploy steps.

## Decisions

### workflow_run gate over an in-workflow `needs` gate
Deploy triggers on `workflow_run: { workflows: ["CI"], types: [completed] }` and the job gates on `github.event.workflow_run.conclusion == 'success'`. `ci.yml` remains the single source of truth for tests; deploy.yml does not re-run them.
- *Why workflow_run over re-adding `needs: test` to deploy.yml?* CI and deploy are separate concerns with different triggers and permissions; re-unifying them would duplicate test runs (the bug the archived change fixed) and couple delivery to a test job inside deploy.yml.
- *Why not a branch-protection "require status check" as the only gate?* It does not cover direct pushes to `main`, which is the reported failure mode; this change closes that hole in the workflows themselves.

### No `branches: [main]` filter on the workflow_run trigger
PR-triggered CI runs have ref `refs/pull/N/merge`, so a `branches` filter on `workflow_run` would silently drop preview deployments. Prod-vs-preview is decided inside the job:
- Production: `workflow_run.event == 'push'` AND `workflow_run.head_branch == 'main'`.
- Preview: everything else.
This replaces the old `github.event_name == 'push'` key.

### Fork-safety check preserved
The job gates on `workflow_run.event == 'push' || workflow_run.head_repository.full_name == github.repository`, the workflow_run equivalent of the old `github.event.pull_request.head.repo.full_name == github.repository` check — PRs from forks still get no deploy.

### Checkout the exact CI commit
`actions/checkout@v7` with `ref: ${{ github.event.workflow_run.head_sha }}`. Without it, checkout resolves default-branch HEAD, which may not match the tested commit.

### Concurrency keyed on head_branch
`group: vercel-deploy-${{ github.event.workflow_run.head_branch }}`. `github.ref` is now always `main` from the workflow_run context, so it can no longer distinguish deploys. Branch-keyed grouping preserves the old per-PR/push isolation and `cancel-in-progress`.

### Preview URL comment via workflow_run PR info
The comment step gates on `workflow_run.event == 'pull_request'` and uses `github.event.workflow_run.pull_requests[0].number` for the issue number instead of `context.issue.number` (which is empty in the workflow_run context).

### `[skip ci]` semantics
`workflow_run` only fires on `completed`, and a skipped CI run concludes `skipped`, not `success` — so `[skip ci]` pushes to `main` no longer deploy. Accepted as an explicit behavior change.

## Risks / Trade-offs

- [workflow_run changes only take effect once deploy.yml is merged to main] → Mitigation: the workflow file is read from the default branch; verification includes this caveat, and the change ships through a PR whose preview deploy will go through the *old* trigger.
- [`workflow_run.pull_requests` may be empty in edge cases] → Mitigation: comment step falls back to an API lookup (`GET /repos/{owner}/{repo}/commits/{sha}/pulls`) if the array is empty.
- [A failing CI run results in a skipped (not failed) deploy job] → Mitigation: intentional — no deployment happens, and the deploy check shows as skipped rather than red, so failing PRs don't surface a confusing deploy failure.
- [Multiple PRs sharing a head branch cancel in-flight deploys via the branch-keyed concurrency group] → Mitigation: acceptable — same-branch work should share a single latest deploy; matches the old `github.ref` behavior closely enough.

## Migration Plan

1. Rework `.github/workflows/deploy.yml` (trigger, gate, checkout ref, env resolution, concurrency group, PR comment step).
2. Update `DEPLOYMENT.md` and `README.md`; update the `vercel-deployment` spec delta.
3. Validate `deploy.yml` YAML (`npx actionlint` or a YAML parser).
4. Manual GitHub verification (failing PR → no preview; passing PR → preview + URL comment; passing push → prod; failing push → no prod).
5. Rollback: revert the workflow commit; the previous trigger and behavior are restored on merge to `main` (workflow_run reads from default branch).

## Open Questions

None.
