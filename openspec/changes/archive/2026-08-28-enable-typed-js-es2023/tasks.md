## 1. Branch and Tooling Setup

- [x] 1.1 Create branch `enable-typed-js-es2023` from `main` (`git checkout -b enable-typed-js-es2023`)
- [x] 1.2 Add devDependencies `typescript` + `@types/node` (pin, e.g. `typescript@^5.5`, `@types/node@^20`) via `npm i -D`
- [x] 1.3 Add `tsconfig.json` at repo root with `target ES2023`, `module NodeNext`, `moduleResolution NodeNext`, `lib ["ES2023"]`, `allowJs:true, checkJs:true, noEmit:true, strict:true, esModuleInterop:true, forceConsistentCasingInFileNames:true, skipLibCheck:true`, `include ["lib/**/*.js","api/**/*.js","server.js"]`, `exclude ["node_modules",".vercel","public","tests"]` (document `public` DOM exclusion)
- [x] 1.4 Add script `typecheck: "tsc --noEmit"` to `package.json` and verify `npx tsc --version` resolves to local install (not deprecated `tsc` stub)
- [x] 1.5 Verify baseline `npm run typecheck` reports errors (expected) and `npm test` + `npm run lint` still pass; no files emitted, `vercel.json` unchanged

## 2. JSDoc Annotations (No Runtime Change)

- [x] 2.1 Annotate `lib/centers.js` with `/** @typedef {{name:string, city:string, ...}} Center */` and `/** @type {Record<string, Center>} */` for `CENTERS`
- [x] 2.2 Annotate `lib/llm.js` (`Provider`, `ChatMessage`, `ChatCompletionOptions`, `resolveModel`, `chatCompletion`) with `/** @param @returns {Promise<...>} */`
- [x] 2.3 Annotate `lib/tools/list-courses.js` with `/** @typedef {z.infer<typeof listCoursesInputSchema> ...} Course */` and `listCourses` return type
- [x] 2.4 Annotate `lib/router.js` (`RouteDecision`, `classifyIntent`), `lib/retrieval.js` (`classifyByRetrieval`, `retrieve`), `lib/schedule-answers.js` (`Course`, `detectScheduleIntent`) with JSDoc
- [x] 2.5 Annotate remaining priority modules `lib/sanitize.js`, `lib/knowledge.js`, `lib/sections.js`, `lib/answer-cache.js`, `lib/scraper/*` where strict errors surface; use `// @ts-expect-error` only with justification comment

## 3. Strict Mode Fixes

- [x] 3.1 Fix all `tsc --noEmit` errors under `strict:true` (implicit any, possibly undefined, unchecked `process.env`) — narrow types or add JSDoc, no behavior change
- [x] 3.2 Confirm `ES2023` lib gate: `findLast` passes, `Object.groupBy`/`Promise.withResolvers` fail (manual check or add comment test)
- [x] 3.3 Ensure `public/markdown.js` remains excluded (or verify separate `lib:DOM` if included) — `tsc` should not report DOM errors for server files

## 4. CI and Verification

- [x] 4.1 Update `.github/workflows/ci.yml` to run `npm run typecheck` after `npm ci` / install, alongside `npm test` and `npm run lint`; block PR on failure
- [x] 4.2 Run `npm run typecheck`, `npm test` (208 tests), `npm run lint` locally — all green
- [x] 4.3 Verify no emitted artifacts (`git status` shows only `tsconfig.json`, `package.json`, `package-lock.json`, JSDoc edits, CI workflow); `vercel build` (or `vercel dev`) still works
- [x] 4.4 Open PR from `enable-typed-js-es2023` → `main`, confirm CI fails on intentional type error and passes when fixed
