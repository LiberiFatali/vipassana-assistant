## Why

The deploy workflow (`.github/workflows/deploy.yml`) triggers on `push`→`main` and `pull_request` and deploys to Vercel unconditionally, in parallel with CI. A direct push to `main` with failing tests still deploys to production, and PR previews are built even when the PR fails CI. The `ci.yml` workflow only *reports* status — it gates nothing.

## What Changes

- Rework `.github/workflows/deploy.yml` to trigger via `workflow_run` on the `CI` workflow, deploying only when the CI run concludes successfully (`workflow_run.conclusion == 'success'`).
- Gate the deploy job with the same fork-safety check the old PR trigger provided (`workflow_run.event == 'push' || workflow_run.head_repository.full_name == github.repository`).
- Check out the exact CI commit (`workflow_run.head_sha`) instead of default-branch HEAD.
- Resolve prod-vs-preview from `workflow_run.event == 'push'` + `workflow_run.head_branch == 'main'` (production) instead of `github.event_name`.
- Key the `concurrency.group` off `workflow_run.head_branch` and the preview-URL comment off `workflow_run.pull_requests[0].number`.
- Update `DEPLOYMENT.md`, `README.md`, and the `vercel-deployment` spec to document the CI gate.
- **BREAKING (behavior)**: `[skip ci]` pushes to `main` no longer deploy (CI skipped → no `success` conclusion). Preview deployments are now also gated on CI passing.

## Capabilities

### New Capabilities

<!-- None — the change modifies an existing capability rather than introducing a new one. -->

### Modified Capabilities

- `vercel-deployment`: add a requirement that production and preview deployments only proceed after the CI workflow completes successfully, and update the GitHub-import deployment scenario to reflect the CI gate.

## Impact

- `.github/workflows/deploy.yml` — trigger, job gate, checkout ref, env resolution, concurrency key, and PR comment step reworked (core change).
- `.github/workflows/ci.yml` — unchanged; remains the single source of truth for tests/lint.
- `DEPLOYMENT.md`, `README.md` — documentation of the CI gate.
- `openspec/specs/vercel-deployment/spec.md` — "Deploy via GitHub import" scenario updated to describe the CI gate.