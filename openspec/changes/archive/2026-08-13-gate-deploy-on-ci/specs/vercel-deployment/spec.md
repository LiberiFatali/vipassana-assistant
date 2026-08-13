## MODIFIED Requirements

### Requirement: Vercel Project Deployment
The chatbot SHALL be deployed as a Vercel project consisting of Node.js serverless functions under `api/` and a static frontend under `public/`, with no build step.

#### Scenario: Deploy via Vercel CLI
- **WHEN** a contributor runs `vercel deploy --prod` with the project linked and environment variables configured
- **THEN** Vercel builds and serves the `public/` static frontend and exposes `api/*` functions at their `/api/*` routes.

#### Scenario: Deploy via GitHub import
- **WHEN** a push to the production branch reaches `main` and the CI workflow (`.github/workflows/ci.yml`) has completed successfully for that commit
- **THEN** Vercel deploys the app with the same structure and environment variables, and no production deployment occurs for a commit whose CI run fails or is skipped.

## ADDED Requirements

### Requirement: CI-Gated Deployments
The deployment workflow (`.github/workflows/deploy.yml`) SHALL trigger on the completion of the CI workflow and SHALL deploy to Vercel only when the CI run concluded successfully. Both production deploys (push to `main`) and preview deploys (pull requests) SHALL be gated on CI passing, and preview deploys SHALL be limited to PRs from the repository's own owner.

#### Scenario: Production deploy after CI success
- **WHEN** a commit is pushed to `main` and its CI workflow run concludes with `success`
- **THEN** the deploy workflow deploys that commit to the production environment.

#### Scenario: No deploy when CI fails
- **WHEN** a commit is pushed to `main` and its CI workflow run concludes with `failure`, `cancelled`, or `skipped`
- **THEN** the deploy workflow does not deploy that commit to production.

#### Scenario: Preview deploy after CI success
- **WHEN** a pull request is opened or updated and its CI workflow run concludes with `success`
- **THEN** the deploy workflow creates a preview deployment and comments the preview URL on the pull request.

#### Scenario: No preview deploy from forks
- **WHEN** a pull request originates from a fork of the repository
- **THEN** the deploy workflow does not create a preview deployment for it.

#### Scenario: Deploy targets the CI-tested commit
- **WHEN** the deploy workflow runs after a successful CI run
- **THEN** it builds and deploys the exact commit that CI tested (`workflow_run.head_sha`), not the default-branch head.
