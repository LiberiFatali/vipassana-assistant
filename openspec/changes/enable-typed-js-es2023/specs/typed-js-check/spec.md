## ADDED Requirements

### Requirement: Typed JavaScript via checkJs at ES2023 with No Emit
The project SHALL provide static type checking for JavaScript via TypeScript `checkJs` at ES2023 target with no build output. A root `tsconfig.json` SHALL set `target ES2023`, `module NodeNext`, `moduleResolution NodeNext`, `lib ["ES2023"]`, `allowJs:true`, `checkJs:true`, `noEmit:true`, `strict:true`, `esModuleInterop:true`, `forceConsistentCasingInFileNames:true`, and include server files (`lib/`, `api/`, `server.js`) while excluding `node_modules/`, `.vercel/`, `public/` (browser) and initially `tests/` if deferred. `typescript` and `@types/node` SHALL be `devDependencies` only; no emit, no bundler, ESM (`type:module`) SHALL be preserved.

#### Scenario: Typecheck runs locally with no emit
- **WHEN** a contributor runs `npm run typecheck` (which runs `tsc --noEmit`)
- **THEN** the command type-checks all included JS files at ES2023 strict mode and exits 0 when no errors, non-zero otherwise, without writing any output files

#### Scenario: ES2023 APIs are available and ES2024-only APIs are rejected
- **WHEN** code uses `Array.prototype.findLast`/`findLastIndex` (ES2023) it type-checks, and when code uses `Object.groupBy`/`Promise.withResolvers` (ES2024) it fails
- **THEN** the `lib ES2023` choice is verified and prevents use of runtime-unavailable APIs on Node >=20

#### Scenario: Vercel deploy is unchanged
- **WHEN** the project is deployed to Vercel
- **THEN** the function still serves plain JS from `api/chat.js` and `lib/` with no emitted artifacts and `vercel.json` unchanged

### Requirement: JSDoc Typedefs for Core Domain Shapes
The codebase SHALL annotate core domain shapes with JSDoc so `checkJs` can validate them without converting to `.ts`. At minimum `lib/centers.js` SHALL export `Center` typedef, `lib/llm.js` SHALL type `Provider` / `ChatMessage` / `chatCompletion` options, `lib/tools/list-courses.js` SHALL type `Course` and derive from `listCoursesInputSchema` via `z.infer` comments, and `lib/router.js` / `lib/retrieval.js` SHALL type `RouteDecision` / classification results. Suppress only with `// @ts-expect-error` plus justification.

#### Scenario: Course shape regression is caught
- **WHEN** a contributor changes a `Course` field (e.g., renames `start_date` to `startDate`) without updating consumers in `lib/schedule-answers.js` or `lib/tools/list-courses.js`
- **THEN** `npm run typecheck` fails on the mismatched property access

#### Scenario: LLM payload shape regression is caught
- **WHEN** `lib/llm.js` `chatCompletion` call omits required `model` or passes wrong `messages` shape
- **THEN** typecheck fails before CI

### Requirement: Typecheck Gated in CI
CI SHALL gate pull requests (and pushes to `main`) on `npm run typecheck` in addition to `npm test` and `npm run lint`. The workflow `/.github/workflows/ci.yml` SHALL install deps and run `npm run typecheck` (using local `typescript`) and block merge on failure.

#### Scenario: PR with type error is blocked
- **WHEN** a PR introduces a type error (e.g., wrong arg type to `sanitize_urls()` in `lib/sanitize.js` or `sanitize_urls()` bypass)
- **THEN** CI fails the typecheck step and the PR cannot be merged

#### Scenario: Push to main runs typecheck
- **WHEN** a commit is pushed to `main`
- **THEN** CI runs `npm run typecheck` against the new head
