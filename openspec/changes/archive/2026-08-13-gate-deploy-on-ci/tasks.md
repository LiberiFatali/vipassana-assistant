## 1. Rework deploy workflow

- [x] 1.1 Change `.github/workflows/deploy.yml` trigger to `workflow_run: { workflows: ["CI"], types: [completed] }` (no `branches` filter)
- [x] 1.2 Gate the deploy job: `if: github.event.workflow_run.conclusion == 'success' && (github.event.workflow_run.event == 'push' || github.event.workflow_run.head_repository.full_name == github.repository)`
- [x] 1.3 Checkout the CI-tested commit: `actions/checkout@v7` with `ref: ${{ github.event.workflow_run.head_sha }}`
- [x] 1.4 Rework "Resolve deployment environment" to key off `workflow_run.event == 'push'` AND `workflow_run.head_branch == 'main'` (production) vs preview
- [x] 1.5 Update `concurrency.group` to `vercel-deploy-${{ github.event.workflow_run.head_branch }}`
- [x] 1.6 Rework "Comment preview URL on PR" to gate on `workflow_run.event == 'pull_request'` and use `workflow_run.pull_requests[0].number` (with API-lookup fallback if empty)

## 2. Documentation

- [x] 2.1 Update `DEPLOYMENT.md` step 2: production deploy happens only after CI passes on push to main
- [x] 2.2 Update `README.md` (deployment section and contributing step 4): merges deploy only after CI passes

## 3. Verification

- [x] 3.1 Validate `.github/workflows/deploy.yml` with `npx actionlint` (or a YAML parser)
- [x] 3.2 Run `openspec validate --change "gate-deploy-on-ci"`
- [ ] 3.3 Manually verify on GitHub after merge (failing PR → no preview; passing PR → preview + URL comment; passing push → prod; failing push → no prod) — post-merge, since `workflow_run` reads `deploy.yml` from the default branch
