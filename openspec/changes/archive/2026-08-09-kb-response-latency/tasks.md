## 1. Answer cache module

- [x] 1.1 Create `api/answer-cache.js` with an `AnswerCache` class mirroring `ScheduleCache` (`api/scraper/cache.js`): Map keyed by `lang|normalized question` → `{ answer, ts }`, 24h TTL, size cap (500) with oldest eviction.
- [x] 1.2 Export a module-level singleton plus `get(key)`, `set(key, value)`, and `clear()`.

## 2. Deterministic quick-answers module

- [x] 2.1 Create `api/quick-answers.js` exporting `getQuickAnswer(text, lang) → string | null`, reusing `normalize()` / `detectLanguage()` from `api/router.js`.
- [x] 2.2 Implement center detection (virocana / Hà Nội, vutthi / TP. HCM, both-centers cue) and info-keyword → data selection (address, phone, email, website) reading live from `lib/centers.js`.
- [x] 2.3 Implement the curated bilingual definition for `vipassana là gì` / `what is vipassana` / `meaning of vipassana` / `vipassana meaning`.
- [x] 2.4 Ensure `maps_url` is excluded (goo.gl is not trusted) and that matching requires a center AND an info keyword so unmatched queries return `null`.

## 3. Wire into api/chat.js

- [x] 3.1 Add `DEFAULT_FAST_MODEL` and read `process.env.FAST_MODEL` (default: a faster free model benchmarked as consistently available, e.g. `mimo-v2.5-free`).
- [x] 3.2 In the KB fast-path branch, order: deterministic quick-answer → answer cache → fast-path LLM call with `FAST_MODEL` (retry once with `AGENT_MODEL` on failure), caching the result on success.
- [x] 3.3 Keep the tool path and classifier on `AGENT_MODEL`; every returned text still passes through `sanitize_urls()`; fast path still attaches no tools.

## 4. Tests

- [x] 4.1 Add `tests/quick-answers.test.mjs`: virocana/vutthi address+phone+email+website in vi/en, both-centers case, bilingual definition, `null` on non-match, trusted-domain URLs.
- [x] 4.2 Add `tests/answer-cache.test.mjs`: set/get, TTL expiry, size-cap eviction, `clear()`.
- [x] 4.3 Update `tests/chat-path.test.mjs`: swap the fast-path fixture from "What is Vipassana?" to a non-deterministic KB question (e.g. "What is the daily timetable during a 10-day course?"); assert `FAST_MODEL` is used on the fast-path request; add a case proving a deterministic address query makes no LLM call.

## 5. Docs

- [x] 5.1 Document `FAST_MODEL` in `README.md` (env vars section and deployment notes).
- [x] 5.2 Document `FAST_MODEL` in `AGENTS.md` (Commands / architecture notes).

## 6. Verification

- [x] 6.1 Run `npm test` and confirm all suites pass (including unchanged `sanitize`, `router`, `sections`).
- [x] 6.2 Manual check with `npm run dev`: "Địa chỉ trung tâm Hà Nội?" returns in <100ms with no LLM call; a repeated generative question returns from cache on the second ask.
