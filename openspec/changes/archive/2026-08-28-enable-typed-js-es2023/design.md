## Context

The project is a bilingual Vipassana chatbot: Node ESM (`type:module`), `api/chat.js` is the sole Vercel function (12-function limit), `lib/` holds router, LLM, retrieval, scraper, schedule, sanitize, and `public/` is a static frontend with no build step. `package.json` engines `>=20`; tests use `node --test` (ESM `.mjs`); lint is `eslint .` with flat config (`ecmaVersion:latest`). Runtime validation uses `zod` (`lib/tools/list-courses.js`, `lib/llm.js`), but edit-time safety is missing — LLM payload shapes, `Course`/`Center` records, and bilingual branching regress silently. Full `.ts` migration was rejected (Option A chosen) to preserve zero-build deploys. `AGENTS.md` mandates `sanitize_urls()` on every path and that `lib/llm.js` is the single LLM entry point.

Constraints: keep ESM and `.js` extensions, no emit, no bundler, no Vercel config change beyond a dev-time typecheck, CI must stay green on `npm test` + `npm run lint`.

## Goals / Non-Goals

**Goals:**
- Enable strict type checking for all server JS (`lib/`, `api/`, `server.js`) via `tsc --noEmit` at ES2023 without emitting/building.
- Gate CI on `tsc --noEmit` (informational then required) alongside tests/lint.
- Add minimal JSDoc typedefs for `Course`, `Center`, `Provider`, `RouteDecision`, `ChatMessage` to catch shape errors.
- Keep behavior identical; no runtime change.

**Non-Goals:**
- Converting files to `.ts`/`.tsx` or adding a build/transpile pipeline.
- Typing `public/markdown.js` / `public/index.html` beyond optional `lib:DOM` exclusion.
- Replacing `zod` runtime checks; types complement them.
- Changing Vercel function count or deployment pipeline.

## Decisions

**Decision: `target ES2023` + `module NodeNext` + `lib ES2023`, `noEmit:true`, `allowJs:true, checkJs:true, strict:true`**
- Rationale: Node 20 fully supports ES2023 (`Array.findLast`, `WeakMap` symbols); ES2024 (`Object.groupBy`, `Promise.withResolvers`) would allow APIs unavailable at runtime. ES2022 is unnecessarily conservative. `NodeNext` preserves ESM (`type:module`) import semantics.
- Alternative: `ES2022` — rejected as leave-behind; `ESNext`/`ES2024` — rejected (permits unavailable APIs). `commonjs` — rejected (breaks ESM).

**Decision: Single `tsconfig.json` at repo root, `include` server files, `exclude` `public/` (or give `public/` a separate `lib:DOM` pass)**
- Rationale: One config minimizes churn; `public/markdown.js` is browser-only (`globals.browser` in `eslint.config.js`), so exclude from Node lib or add `lib:["ES2023","DOM"]` override if included. Keeps IDE simple.
- Alternative: Two tsconfigs (`tsconfig.json` + `tsconfig.browser.json`) — deferred until browser typing needed.

**Decision: `typescript` + `@types/node` as `devDependencies` only; script `typecheck: tsc --noEmit`**
- Rationale: Matches existing `devDependencies` pattern (`eslint`, `@eslint/js`, `globals`). No runtime cost. Binary `tsc` comes from local install, not `npx tsc` (which hit the deprecated `tsc` stub).
- Alternative: Global `tsc` — rejected (non-hermetic CI).

**Decision: JSDoc typedefs over `// @ts-check` per-file headers**
- Rationale: With `checkJs:true`, all `allowJs` files are checked; per-file `// @ts-check` redundant. Add `/** @typedef */` in `lib/centers.js`, `lib/llm.js`, `lib/tools/list-courses.js`, `lib/router.js`, `lib/retrieval.js` and `/** @param @returns */` on exported functions. Use `// @ts-expect-error` with comment for justified suppressions.
- Alternative: Per-file headers — unnecessary noise.

**Decision: CI integration as `npm run typecheck` step in `.github/workflows/ci.yml`**
- Rationale: Parity with `npm test` / `npm run lint`. Run `tsc --noEmit` after `npm install` (uses local `typescript`). Fail PR if type errors.
- Alternative: Pre-commit hook only — rejected (not enforced on PRs).

## Risks / Trade-offs

- **Strict mode surfaces pre-existing implicit-any / JSDoc gaps** → Mitigation: incremental fixes; suppress with `// @ts-expect-error` + TODO linking to follow-up; no behavior change.
- **Zod-inferred types diverge from JSDoc** → Mitigation: derive JSDoc from `z.infer` comments; keep `zod` as source of truth, JSDoc as mirror.
- **`public/` DOM types pollute Node lib** → Mitigation: exclude `public/` from root `include`; add browser override only if needed.
- **Developer friction (IDE reports vs CI)** → Mitigation: document `npm run typecheck` locally; VS Code auto-picks `tsconfig.json`; no build required.
- **Vercel still deploys plain JS** → Mitigation: verify `vercel.json` unchanged; `tsconfig` `noEmit` ensures no artifacts to ignore.

## Migration Plan

1. Branch `enable-typed-js-es2023` off `main`.
2. Add `tsconfig.json` (ES2023, NodeNext, strict, noEmit, allowJs/checkJs) with `include: ["lib","api","server.js"]`, `exclude: ["node_modules",".vercel","public","tests"]` (tests excluded initially; enable later).
3. `npm i -D typescript @types/node`; add `scripts.typecheck: "tsc --noEmit"`.
4. Annotate priority modules (`lib/centers.js`, `lib/llm.js`, `lib/tools/list-courses.js`, `lib/router.js`, `lib/retrieval.js`, `lib/schedule-answers.js`) with JSDoc; fix `tsc` errors iteratively.
5. `npm run typecheck` locally; `npm test` + `npm run lint` must still pass.
6. Update `.github/workflows/ci.yml` to run `npm run typecheck`.
7. PR → review → merge; no deploy config change, rollback is revert of `tsconfig.json` + devDeps.

## Open Questions

- Include `tests/*.mjs` in strict checking immediately or defer (exclude initially, enable in follow-up to avoid test-utility noise)?
- Should `public/markdown.js` get a separate `tsconfig.browser.json` with `lib:DOM` or stay excluded?
