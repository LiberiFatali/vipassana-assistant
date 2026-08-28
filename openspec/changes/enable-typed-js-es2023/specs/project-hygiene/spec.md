## MODIFIED Requirements

### Requirement: Pull-request CI runs tests and lint
Every pull request targeting the `main` branch SHALL run the repository's unit test suite, its linter, and its typecheck before the change can be merged, and a push to `main` SHALL run all three as well.

#### Scenario: PR runs tests, lint, and typecheck
- **WHEN** a contributor opens or updates a pull request targeting `main`
- **THEN** the CI workflow runs `npm test`, `npm run lint`, and `npm run typecheck` (`tsc --noEmit` at ES2023 strict) against the PR's head, and the PR is blocked if any fails

#### Scenario: push to main runs tests, lint, and typecheck
- **WHEN** a commit is pushed directly to `main`
- **THEN** the CI workflow runs `npm test`, `npm run lint`, and `npm run typecheck` against the new head
