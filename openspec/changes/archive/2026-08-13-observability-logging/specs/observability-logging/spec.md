# observability-logging Specification

## Purpose

Structured JSON-line runtime logging for the Vipassana assistant on Vercel. Emits searchable, correlated events for every request (answer path, latency, LLM and scraper health) so production issues can be reproduced and fixed, using only Node built-ins and Vercel Runtime Logs — zero new dependencies, Hobby-plan compatible.

## ADDED Requirements

### Requirement: Structured Log Output
The system SHALL emit all runtime telemetry as single-line JSON objects via `console.*` methods (`console.log` for info, `console.warn` for warn, `console.error` for error), each carrying an ISO `ts`, a `level`, an `event` name, and a `requestId`.

#### Scenario: Log line is valid JSON
- **WHEN** any component logs an event
- **THEN** the output is exactly one JSON object on one line that parses successfully and contains `ts`, `level`, `event`, and `requestId` fields

#### Scenario: Severity maps to console method
- **WHEN** a component logs at info / warn / error level
- **THEN** the line is emitted via `console.log` / `console.warn` / `console.error` respectively

### Requirement: Request and Conversation Correlation
The system SHALL correlate every log line within one request via a unique `requestId` and within one conversation via an optional `conversationId`, without requiring correlation IDs to be threaded through each module's call signatures.

#### Scenario: All events share a requestId
- **WHEN** a `POST /api/chat` request is processed and multiple events are emitted across modules (e.g. `api/chat.js`, `lib/llm.js`, scraper)
- **THEN** every emitted line carries the same `requestId` value

#### Scenario: Conversation id flows into logs
- **WHEN** a client sends an optional `conversationId` string in the request body
- **THEN** every line for that request includes that `conversationId`, bounded to a safe maximum length

#### Scenario: Missing conversation id is tolerated
- **WHEN** a client sends a request without a `conversationId` (or with a non-string value)
- **THEN** the request is processed normally and `conversationId` is absent/null in the emitted lines

### Requirement: Request Lifecycle Events
The system SHALL emit lifecycle events for each processed request: `request.start` before routing, `route.decision` after intent classification, `path.answer` describing which answer path served the user, and `request.end` summarizing the outcome and total latency.

#### Scenario: Fast-path request is observable
- **WHEN** a knowledge-only request is served (e.g. from the answer cache, quick answers, or a single fast-path LLM call)
- **THEN** `request.start`, `route.decision` with `route: "kb"`, and `path.answer` with `path` in `out-of-scope | missing-key | quick | cache | fast` are emitted, and `path.answer` includes `latencyMs` and `answerLen`

#### Scenario: Live-data request is observable
- **WHEN** a request is served via the schedule fast path or the pure-composer path
- **THEN** `path.answer` is emitted with `path` in `schedule | quick-fallback | composer` and includes `latencyMs` and `answerLen`

#### Scenario: Request completion is always logged
- **WHEN** a request finishes, whether successfully or with an error/timeout
- **THEN** `request.end` is emitted with `outcome` in `ok | error | timeout` and the total `latencyMs`

### Requirement: LLM Call Telemetry
The system SHALL emit telemetry for every LLM interaction: successful calls (`llm.call` with provider, model, latency, and attempt), 429 backoff waits (`llm.backoff`), and failures (`llm.error`).

#### Scenario: Successful call is logged
- **WHEN** a `chatCompletion` call returns successfully
- **THEN** an `llm.call` line is emitted with `provider`, `model`, `latencyMs`, and `attempt`

#### Scenario: Backoff is logged
- **WHEN** a provider returns HTTP 429 and the retry policy waits with exponential backoff
- **THEN** an `llm.backoff` warning is emitted with `status`, `attempt`, and `delayMs`

#### Scenario: Failure is logged with sanitized detail
- **WHEN** an LLM call fails after retries/backoff are exhausted
- **THEN** an `llm.error` line is emitted with `provider`, the HTTP `status` when known, and a message truncated to a bounded length that contains no API keys or provider payloads

### Requirement: Schedule Data Freshness Telemetry
The system SHALL emit a `schedule.fetch` event whenever course data is resolved, reporting the `data_freshness` value (`live`, `cached`, or `fallback`), the center, the record count, and latency. Scraper failures SHALL be surfaced as events rather than silently swallowed.

#### Scenario: Freshness is reported per resolution branch
- **WHEN** course data is returned from the short-TTL cache, a live scrape, or the stale-cache/static fallback chain
- **THEN** a `schedule.fetch` line is emitted with `centerId`, `freshness` set to `cached` / `live` / `fallback` respectively, `count`, and `latencyMs`

#### Scenario: Scraper failure is logged
- **WHEN** a scrape fails and the fallback chain is used, or a non-recoverable error is thrown
- **THEN** a `schedule.fetch-error` event is emitted with the center and a sanitized error message, while the request still completes with the fallback data or the standard error text

#### Scenario: Schedule fast-path swallows are surfaced
- **WHEN** `getScheduleAnswer` or `buildLiveScheduleContext` catches an exception and falls through
- **THEN** a `schedule.deterministic.error` / `schedule.context.error` warning is emitted with a sanitized message, and the request still completes via the existing fall-through behavior

### Requirement: Query Content Privacy
The system SHALL log a bounded preview of the latest user message plus a hash for repeat detection, SHALL NOT log full message or answer texts, and SHALL sanitize all error output.

#### Scenario: Preview is bounded and normalized
- **WHEN** a `request.start` event is emitted
- **THEN** `qPreview` is the diacritic-stripped latest user message truncated to at most 80 characters, and `qHash` is a fixed-length sha256-derived digest of the normalized message

#### Scenario: Full transcripts are never logged
- **WHEN** any event is emitted for a request
- **THEN** no line contains a full user message, a full assistant answer, or an LLM provider payload; answers are represented only by `answerLen`

#### Scenario: Errors are sanitized
- **WHEN** an error is logged via `safeErr`
- **THEN** the line contains only `name` and a message truncated to at most 300 characters, with no stack traces, API keys, or authorization headers

### Requirement: Client Conversation Identity
The client UI SHALL generate a per-conversation `conversationId`, persist it locally, send it with each chat request, and rotate it when the conversation is cleared.

#### Scenario: New conversation id is sent
- **WHEN** a user sends a chat message
- **THEN** the client includes a `conversationId` in the `POST /api/chat` body, generated once per conversation and reused across messages in that conversation

#### Scenario: Clear rotates the conversation id
- **WHEN** the user clears the chat
- **THEN** the client generates a new `conversationId` for subsequent messages

### Requirement: Level Filtering
The system SHALL honor a `LOG_LEVEL` environment variable (default `info`) that filters emitted events by severity.

#### Scenario: Warn-only mode
- **WHEN** `LOG_LEVEL=warn` is set
- **THEN** info-level events are suppressed while warn and error events are still emitted

#### Scenario: Default is info
- **WHEN** `LOG_LEVEL` is unset
- **THEN** info, warn, and error events are all emitted

### Requirement: Zero New Dependencies
The logging layer SHALL use only Node.js built-ins and the existing codebase; no new runtime or development dependencies SHALL be added, and no new files under `api/` SHALL be created.

#### Scenario: No package changes
- **WHEN** the change is implemented
- **THEN** `package.json` dependency and devDependency lists are unchanged and `find api -name '*.js'` still returns exactly `api/chat.js`
