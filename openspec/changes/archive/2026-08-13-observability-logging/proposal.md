# Proposal: Structured Observability Logging

## Why

The app is deployed on the Vercel Hobby plan, yet the only runtime telemetry is six scattered, unstructured `console.error` calls. Failures in the LLM call path, the scraper freshness chain (live → cached → fallback), and the silent `catch {}` swallows in the schedule fast path are effectively invisible — there is no way to reproduce a failing request, correlate the turns of one conversation, or measure which answer path serves users. This makes fixing production issues a guessing game.

## What Changes

- Add a zero-dependency `lib/log.js` module that emits structured JSON lines via `console.*` into Vercel Runtime Logs, with a request-scoped correlation context (AsyncLocalStorage) carrying `requestId` and `conversationId`.
- Generate a `requestId` per request and accept an optional `conversationId` from the client body (backward compatible — absent field is tolerated).
- Emit request-lifecycle events in `api/chat.js`: `request.start`, `route.decision`, `path.answer`, `request.end`, plus structured error/retry/timeout events replacing the existing bare `console.error` lines.
- Instrument `lib/llm.js` with `llm.call`, `llm.backoff`, `llm.error`, and `llm.key-missing` events.
- Instrument `lib/tools/list-courses.js` with `schedule.fetch` (reporting `data_freshness` live/cached/fallback) and `schedule.fetch-error` events.
- Emit `schedule.deterministic.error` / `schedule.context.error` warnings from the previously silent `catch {}` swallows in `lib/schedule-answers.js`.
- Send a `conversationId` (`crypto.randomUUID()` persisted in `localStorage`, regenerated on Clear) from `public/index.html` so a full conversation is greppable across requests.
- Add unit + integration tests for the logging layer and the request-path events.
- Update `AGENTS.md` with the new module and a short "Observability & logging" subsection.

## Capabilities

### New Capabilities
- `observability-logging`: Structured JSON-line runtime logging with per-request and per-conversation correlation, query-content previews (truncated, diacritic-stripped) plus hashes for repeat detection, and error capture across the LLM, scraper, and schedule fast paths — zero new dependencies, Hobby-plan compatible.

### Modified Capabilities
<!-- None: no existing spec-level requirements change. The POST /api/chat endpoint
     stays stateless; the optional conversationId is additive. -->

## Impact

- **Code**: new `lib/log.js`; instrumented `api/chat.js`, `lib/llm.js`, `lib/tools/list-courses.js`, `lib/schedule-answers.js`; client change in `public/index.html`.
- **Tests**: new `tests/log.test.mjs` and `tests/logging-path.test.mjs`; existing suites unaffected (no static-prompt strings touched).
- **Dependencies**: none — only Node built-ins (`node:async_hooks`, `node:crypto`, `node:util`).
- **Runtime**: no new `api/*` functions (the 12-function Vercel limit is untouched); logging is fire-and-forget `console` output consumed by Vercel Runtime Logs.
- **Privacy**: logs carry a truncated 80-char preview of the latest user message and a `sha256` hash; never full transcripts, never API keys or provider payloads.
- **Out of scope (future)**: durable conversation persistence (Vercel Blob / marketplace store with redaction + retention) and Log Drains / third-party backends (Pro-plan features).
