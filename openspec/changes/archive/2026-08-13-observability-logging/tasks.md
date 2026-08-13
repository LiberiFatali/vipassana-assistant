# Tasks: Structured Observability Logging

## 1. Logging core module

- [x] 1.1 Create `lib/log.js`: `logInfo/logWarn/logError(event, fields)` emitting one JSON line via the matching `console` method, with `ts`, `level`, `event` always present
- [x] 1.2 Add `withLogContext(ctx, fn)` backed by `AsyncLocalStorage` so `log()` merges `requestId` / `conversationId` / `lang` into every line
- [x] 1.3 Add `safeErr(err)` that reduces errors to `{name, message}` with the message truncated to 300 chars (no stacks, no keys)
- [x] 1.4 Add `hashQuestion(text)` producing a 16-hex-char sha256 digest of the normalized text (`node:crypto` + `lib/normalize.js`)
- [x] 1.5 Add `qPreview(text)` returning the diacritic-stripped text truncated to 80 chars
- [x] 1.6 Add `LOG_LEVEL` env filtering (default `info`; `warn`/`error` suppress lower severities)

## 2. Request lifecycle instrumentation

- [x] 2.1 In `api/chat.js`: generate `requestId = crypto.randomUUID()` in the `POST` handler and parse an optional bounded `conversationId` from the body
- [x] 2.2 Wrap the response generation in `withLogContext({ requestId, conversationId, lang }, ...)`
- [x] 2.3 Emit `request.start` (nMessages, lang, qPreview, qHash, hasConversationId) before routing
- [x] 2.4 Emit `route.decision` (route, lang) after intent classification and `route.error` on classification failure
- [x] 2.5 Emit `path.answer` (path, latencyMs, cacheHit, answerLen) at each answer return point: out-of-scope, missing-key, quick, cache, fast, schedule, quick-fallback, composer
- [x] 2.6 Emit `request.end` (outcome ok/error/timeout, latencyMs) for every completion, including error and timeout paths
- [x] 2.7 Replace the bare `console.error` calls at `api/chat.js:237,265,295,314,317` with structured `route.error` / `fast-path.error` / `composer.error` / `fast-timeout` / `fast-retry` events via `logError`

## 3. LLM instrumentation

- [x] 3.1 In `lib/llm.js`: emit `llm.call` (provider, model, latencyMs, attempt) on successful `attemptProvider` returns
- [x] 3.2 Emit `llm.backoff` (provider, status, attempt, delayMs) when a 429 schedules a backoff wait
- [x] 3.3 Emit `llm.error` (provider, status when known, sanitized message via `safeErr`) on terminal provider failure
- [x] 3.4 Replace `warnApiKeyMissing`'s `console.error` with a once-per-cold-start `llm.key-missing` event
- [x] 3.5 Verify no signature changes to `chatCompletion`/`attemptProvider` (correlation comes from ALS context)

## 4. Schedule / scraper instrumentation

- [x] 4.1 In `lib/tools/list-courses.js`: emit `schedule.fetch` (centerId, freshness live/cached/fallback, count, latencyMs) at each cache-hit, live-scrape, and fallback resolution branch
- [x] 4.2 Emit `schedule.fetch-error` (centerId, sanitized message) when a non-recoverable scrape error is thrown
- [x] 4.3 In `lib/schedule-answers.js`: emit `schedule.deterministic.error` in the `getScheduleAnswer` catch block
- [x] 4.4 Emit `schedule.context.error` in the `buildLiveScheduleContext` catch block

## 5. Client conversation identity

- [x] 5.1 In `public/index.html`: add a `SESSION_KEY` (`vipassana_chat_session`) storing a `conversationId` generated via `crypto.randomUUID()` (with a non-crypto fallback for old browsers)
- [x] 5.2 Send `conversationId` in the `POST /api/chat` body alongside `messages`
- [x] 5.3 Regenerate the `conversationId` in `clearChat()`

## 6. Tests

- [x] 6.1 Add `tests/log.test.mjs`: JSON-line validity, level→console method mapping (spy on console), ALS context merge, `safeErr` truncation, `LOG_LEVEL` filtering, `hashQuestion` determinism
- [x] 6.2 Add `tests/logging-path.test.mjs`: stub `console` capture and assert `POST /api/chat` emits `request.start` + `path.answer` with a shared `requestId`
- [x] 6.3 Assert a body-provided `conversationId` is echoed into emitted lines, and that omitting it still works
- [x] 6.4 Assert a 500-stubbed LLM call emits a structured `error` event and still returns the static bilingual error text (existing behavior preserved)
- [x] 6.5 Run `npm test` and `npm run lint` and fix any failures

## 7. Documentation

- [x] 7.1 Add `lib/log.js` to the `AGENTS.md` architecture layout
- [x] 7.2 Add a short "Observability & logging" subsection to `AGENTS.md` (event names, correlation IDs, privacy posture: truncated preview + hash, never full transcripts)
- [x] 7.3 Verify no static prompt strings (`KNOWLEDGE_SYSTEM_PROMPT`, router/sections phrases) were modified
