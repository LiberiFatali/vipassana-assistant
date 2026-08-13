# Design: Structured Observability Logging

## Context

The app is a single-endpoint (`POST /api/chat`) Node.js serverless function on Vercel Hobby. It is deliberately stateless and dependency-light: history lives in the browser's `localStorage`, the server is built for small deterministic paths with a single LLM call, and the only telemetry today is six bare `console.error` calls in `api/chat.js` and `lib/llm.js`.

Vercel Runtime Logs capture everything written to `stdout`/`stderr` from `console.*` and are searchable in the dashboard. Hobby retention is short, so the logging design maximizes signal per line: structured JSON, request-level correlation, no noise.

Key invariants to preserve (from `AGENTS.md`):
- No new `api/*` functions (Vercel 12-function limit); everything lives under `lib/`.
- The final text of every path passes through `sanitize_urls()`.
- The fast path never attaches tools.
- Static prompt strings are byte-for-byte frozen (tests grep them) — logging must not touch them.
- Security posture: the agent never handles personal data; logs must not become a PII leak.

## Goals / Non-Goals

**Goals:**
- Structured, greppable JSON log lines in Vercel Runtime Logs with zero new dependencies.
- Per-request `requestId` and per-conversation `conversationId` correlation on every log line, without threading IDs through every call signature.
- Capture the currently invisible failure modes: LLM errors/backoff/timeouts, scraper `data_freshness` (live/cached/fallback), and the silent `catch {}` swallows in the schedule fast path.
- Answer-path telemetry (`path.answer`) to see how users are served over time.
- Query repeat-detection and debugging context without storing full transcripts.
- Hobby-plan compatible (no Log Drains, no Pro features).

**Non-Goals:**
- Durable conversation persistence (phase 2 — Vercel Blob / marketplace store, redaction, retention).
- Log Drains / third-party observability backends (Pro-plan feature).
- Dashboards or alerting — dashboard search is sufficient for phase 1.
- Changing the request/response contract in a breaking way.

## Decisions

### D1. JSON-line structured logging via a tiny `lib/log.js` module
Every event is one JSON object on one line, emitted through the matching `console` method (`info`→`console.log`, `warn`→`console.warn`, `error`→`console.error`) so severity is reflected in the dashboard. Line shape:
```json
{"ts":"...","level":"info","event":"path.answer","requestId":"...","conversationId":"...","path":"fast","latencyMs":412,"answerLen":184}
```
**Alternatives considered:** third-party loggers (rejected — adds deps, contradicts the project's minimalism); plain string `console.error` (rejected — not greppable as structured data).

### D2. AsyncLocalStorage for correlation context — no signature churn
`withLogContext({requestId, conversationId, lang}, fn)` runs the request handler inside an ALS store. `log()` merges the current store into every line, so `lib/llm.js`, `lib/router.js`, and the scraper emit correlated lines **without any signature changes**.
**Alternatives considered:** threading a `meta` option through `chatCompletion` → `attemptProvider` → `classifyIntent` (rejected — invasive, touches many signatures and tests); a module-level mutable variable (rejected — unsafe with concurrent invocations on one warm instance).
Node 20+ `AsyncLocalStorage` is available in the Vercel Node serverless runtime (this function runs in Node, not edge).

### D3. Request + conversation identifiers
- `requestId = crypto.randomUUID()` generated once per request in the `POST` handler.
- `conversationId` read from the request body (optional; validated as a bounded string, max ~64 chars; absent → `null` in logs). Server stays backward compatible with the existing client.
- Client (`public/index.html`) generates `crypto.randomUUID()` once, persists it in `localStorage` under a new `SESSION_KEY`, sends it in the body, and regenerates it in `clearChat()` (with a non-crypto fallback for very old browsers).

### D4. Query content: truncated preview + hash, never full transcripts
Every `request.start` line carries:
- `qPreview`: first 80 chars of the latest user message, diacritic-stripped (`lib/normalize.js`), for readable debugging.
- `qHash`: `sha256(normalize(text))` truncated to 16 hex chars (`node:crypto`) for repeat/error correlation.
Full message text, full answers, and provider payloads are never logged; `answerLen` (character count) is logged instead.
**Trade-off accepted by the user:** `qPreview` is mildly PII-bearing; it is bounded and truncated, and consistent with the goal of capturing errors for fixing.

### D5. Event catalog
| Module | Event | Level | Fields |
|---|---|---|---|
| `api/chat.js` | `request.start` | info | nMessages, lang, qPreview, qHash, hasConversationId |
| `api/chat.js` | `route.decision` | info | route (kb/tools), lang |
| `api/chat.js` | `route.error` | error | message (sanitized) |
| `api/chat.js` | `path.answer` | info | path, latencyMs, cacheHit, answerLen |
| `api/chat.js` | `request.end` | info | outcome (ok/error/timeout), latencyMs |
| `api/chat.js` | `fast-timeout` | error | message |
| `api/chat.js` | `fast-retry` | error | message |
| `lib/llm.js` | `llm.call` | info | provider, model, latencyMs, attempt |
| `lib/llm.js` | `llm.backoff` | warn | provider, status, attempt, delayMs |
| `lib/llm.js` | `llm.error` | error | provider, status, message (truncated) |
| `lib/llm.js` | `llm.key-missing` | error | (once per cold start) |
| `lib/tools/list-courses.js` | `schedule.fetch` | info | centerId, freshness, count, latencyMs |
| `lib/tools/list-courses.js` | `schedule.fetch-error` | error | centerId, message |
| `lib/schedule-answers.js` | `schedule.deterministic.error` | warn | message |
| `lib/schedule-answers.js` | `schedule.context.error` | warn | message |

`path.answer.path` ∈ `out-of-scope | missing-key | quick | cache | fast | schedule | quick-fallback | composer`.

### D6. Error sanitization
`safeErr(err)` reduces an `Error` to `{name, message}` with the message truncated to 300 chars. Full stacks are never logged (they can embed context and bloat lines); keys and `Authorization` headers are never logged. `llm.error` captures the HTTP status; the provider error body is already truncated upstream in `lib/llm.js:175` before it reaches the logger.

### D7. Level filtering
`LOG_LEVEL` env (default `info`): `warn` / `error` quiet the lower severities. Cheap, no dependency, keeps local/test output clean if desired.

### D8. Freshness surfacing
`data_freshness` is resolved inside `lib/tools/list-courses.js` (cache hit, live scrape, or `get_or_fallback`). `schedule.fetch` is emitted exactly where each branch resolves, carrying `freshness: "live" | "cached" | "fallback"` per center. The two silent `catch {}` blocks in `lib/schedule-answers.js` (`getScheduleAnswer`, `buildLiveScheduleContext`) emit warnings so scraper failures stop being invisible.

## Risks / Trade-offs

- **Hobby log retention is short (hours–days)** → Phase 1 accepts this; high-value signals are per-request, and a phase 2 can add durable storage/drains.
- **`qPreview` may expose user-typed content in logs** → Bounded to 80 chars, diacritic-stripped; `qHash` is the primary correlation key; full text never logged. A `LOG_QUERY_PREVIEW=0` env toggle can suppress it if the posture tightens.
- **Log volume / noise** → Low-traffic chatbot; a few lines per request is acceptable. `LOG_LEVEL` filter exists if it ever isn't.
- **ALS overhead** → Negligible per request; standard Node pattern; no measurable latency impact.
- **Test output noise** → New logs appear during `node --test`; existing suites assert on response bodies, not console, so they stay green.
- **AsyncLocalStorage across awaits in the function** → Correct by design; the handler is wrapped in one `withLogContext` scope and all logging happens inside it.

## Migration Plan

- Deploy as one change: add `lib/log.js`, instrument the modules, add the client `conversationId`, add tests, update `AGENTS.md`.
- Rollback: revert the single PR — logging is additive and non-behavioral (existing `console.error` calls are replaced, response behavior unchanged). `conversationId` is optional so an old client continues to work against a new server and vice versa.
- No schema/migration; no new env vars required (all optional).

## Open Questions

- None blocking. Optional follow-ups (out of scope): `LOG_QUERY_PREVIEW=0` default flip, durable storage, drains.
