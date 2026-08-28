## Why

The codebase (3.7k LOC, 21 JS files, `package.json` `type:module`, Node >=20, single Vercel function `api/chat.js`) has no static type checking. `zod` validates at runtime (`lib/tools/list-courses.js`, `lib/llm.js`) but misses refactoring regressions, LLM payload shape errors (`lib/llm.js:230 chatCompletion`), and course/center record inconsistencies during development. Full TypeScript migration adds a build step and breaks the project's zero-build invariant. Option A — typed JavaScript via `tsc --noEmit` with `allowJs`+`checkJs` and ES2023 — gives ~80% of the type safety for ~10% of the cost.

## What Changes

- Add `tsconfig.json` with `target ES2023` / `module NodeNext` / `allowJs:true` / `checkJs:true` / `noEmit:true` / `strict:true` covering `lib/`, `api/`, `server.js` (exclude `public/` browser code or add separate `lib` set).
- Add `typescript` + `@types/node` to `devDependencies` (no runtime deps).
- Add npm script `typecheck: tsc --noEmit` and wire into CI (`.github/workflows/ci.yml`) alongside `npm test` + `npm run lint`.
- Annotate key modules with JSDoc `/** @typedef */` / `/** @param @returns */` to tighten `Course`, `Center`, `Provider`, `RouteDecision` shapes without converting files to `.ts`.
- Keep `.js` extensions and ESM; no emit, no bundler, Vercel deployment unchanged.

## Capabilities

### New Capabilities
- `typed-js-check`: Static type checking for JavaScript via TypeScript's checkJs (ES2023 target, strict mode, CI-gated, no build output).

### Modified Capabilities
- `project-hygiene`: Extend hygiene/CI requirement to include type-check gate; add TypeScript tooling to ignored/linted file sets without breaking existing lint/test contracts. A delta spec will update CI and ignore rules.

## Impact

- **Code**: `lib/*.js`, `api/chat.js`, `server.js`, `lib/tools/*`, `lib/scraper/*` gain JSDoc types; no runtime behavior change.
- **Tooling**: New `tsconfig.json`, `devDependencies` (`typescript`, `@types/node`), `package.json` script, CI workflow update.
- **Deployment**: No change — Vercel still serves plain JS; no emitted artifacts to `.gitignore`.
- **Risk**: Strict mode may surface existing JSDoc/implicit-any errors; fix by narrowing types or adding `// @ts-ignore` with justification, no functional changes.
