## ADDED Requirements

### Requirement: Pull-request CI runs tests and lint
Every pull request targeting the `main` branch SHALL run the repository's unit test suite and its linter before the change can be merged, and a push to `main` SHALL run both as well.

#### Scenario: PR runs tests and lint
- **WHEN** a contributor opens or updates a pull request targeting `main`
- **THEN** the CI workflow runs `npm test` and `npm run lint` against the PR's head, and the PR is blocked if either fails

#### Scenario: push to main runs tests and lint
- **WHEN** a commit is pushed directly to `main`
- **THEN** the CI workflow runs `npm test` and `npm run lint` against the new head

### Requirement: README stays concise and defers internals
`README.md` SHALL be a concise, human-readable overview of the project (purpose, features, quick start, run/test/deploy commands, security summary) and SHALL link to `AGENTS.md` for architecture, per-file layout, and other churn-prone internals rather than duplicating them.

#### Scenario: README links to AGENTS.md for internals
- **WHEN** a reader opens `README.md`
- **THEN** the document links to `AGENTS.md` and does not contain a per-file code listing, per-file test descriptions, or provider/model environment-variable enumerations that are maintained in `AGENTS.md`

#### Scenario: README commands match the repository
- **WHEN** a new contributor follows the README's install and run instructions exactly as written
- **THEN** every referenced path and command (e.g. `npm install`, `npm run dev`, `npm test`, `npm run lint`, `vercel deploy --prod`) exists and works in the current repository
