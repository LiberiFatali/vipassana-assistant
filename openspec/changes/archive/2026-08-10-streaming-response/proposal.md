## Why

KB and tool-path responses are currently non-streaming: the client sees a "thinking" animation for the entire request and receives the full answer only when the LLM finishes, so a knowledge-only question feels like a ~10-20s wait even though the first tokens are ready in ~5s. Streaming the response lets the UI render tokens as they arrive, dramatically improving perceived latency with no change to accuracy or safety.

Additionally, `vercel deploy` currently fails with `Error: No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan`. Vercel treats **every `.js` file under `api/`** (including subdirectories) as its own serverless function, and the refactors that introduced `router`, `sections`, `quick-answers`, `answer-cache`, and `normalize` pushed the count from 9 to 14, over the Hobby cap. Old deployments do not consume quota — the limit is evaluated per-deployment on the uploaded code — so the only fix is shrinking the `api/` directory back to a single function. Because this change already rewrites the same files (imports in `api/chat.js`, `tests/*`, docs), the relocation is folded in here to avoid churning import paths twice.

## What Changes

- **Streaming API** (`api/chat.js`): the endpoint learns to stream when the client requests it (SSE, `Accept: text/event-stream` or `?stream=1`), emitting incremental text deltas followed by a final complete `done` event carrying the fully-sanitized answer. **BREAKING** for the transport shape only when streaming is negotiated — the non-streaming `POST /api/chat → { text }` contract stays intact for compatibility and the eval suite.
- **Relocate helpers out of `api/`**: move the 13 non-endpoint modules from `api/` to `lib/` (`system-prompt`, `knowledge`, `sanitize`, `normalize`, `router`, `sections`, `quick-answers`, `answer-cache`, plus `lib/scraper/` and `lib/tools/`), leaving `api/chat.js` as the sole serverless function so deploys fit under the Hobby 12-function limit. The new streaming helper also lives in `lib/stream.js`, not `api/`. Behavior is unchanged — only file layout and import paths differ.
- **Streaming LLM calls**: a new streaming chat-completions call (Zen `stream: true`) for the KB fast path, and streaming of the final text-generating step of the tool loop (with `status` events during tool execution).
- **Rolling URL sanitization**: `sanitize_urls()` still gates every emitted byte; a small rolling buffer keeps partial URLs from being cut mid-URL at chunk boundaries, so the trusted-domain invariant holds on streamed output too.
- **Frontend incremental rendering** (`public/index.html`): parse the SSE stream, append deltas, and re-render the accumulated markdown incrementally (throttled via rAF); cancel the in-flight request when the user sends a new message.
- **Local dev server** (`server.js`): proxy the streaming response body instead of buffering it.
- **Tests**: new streaming-path tests (stubbed fetch that yields a stream) asserting deltas + final sanitized `done` event; existing non-streaming suites remain green.

## Capabilities

### New Capabilities
- `streaming-responses`: Incremental delivery of agent answers over SSE — negotiated streaming, delta/status/done/error events, rolling sanitized URL gating, and frontend incremental markdown rendering.

### Modified Capabilities
<!-- No spec-level requirement changes: the response shape on the wire is not part of any existing requirement. The existing chatbot-agent and fast-kb-answers requirements (bilingual retrieval, live discovery, safe domain gating, HITL, no-tools fast path, sanitize backstop) are preserved; streaming is additive delivery of the same sanitized text. The api/ → lib/ relocation is a file-layout change with no user-facing behavior, so it also introduces no spec-level requirement changes (the project-hygiene main spec's `api/*` path references are updated at sync/archive). -->

## Impact

- **Code (modified):** `api/chat.js` (streaming negotiation + SSE writer + streaming LLM call + rolling sanitize), `public/index.html` (stream reader + incremental render + abort), `server.js` (stream proxy), `tests/chat-path.test.mjs` (ensure non-streaming path unchanged; import paths for moved modules), plus import-path fixes in the 13 relocated helper modules and all `tests/*.test.mjs`
- **Code (moved, unchanged behavior):** `api/{system-prompt,knowledge,sanitize,normalize,router,sections,quick-answers,answer-cache}.js` → `lib/`, `api/scraper/*` → `lib/scraper/`, `api/tools/*` → `lib/tools/` (import paths only)
- **Code (new):** `lib/stream.js` (SSE framing + rolling sanitize helper), `tests/stream.test.mjs`
- **Docs:** `README.md`, `AGENTS.md` (streaming negotiation + invariant notes + `api/ → lib/` layout)
- **Untouched:** `lib/centers.js`, `lib/fallback-schedule.json`, `public/markdown.js`
- **API:** `POST /api/chat` — unchanged for existing clients; new optional SSE mode.
- **Infra:** Vercel function (api/chat.js) already supports streaming responses; `vercel.json` maxDuration unchanged (60s). Deployment now produces exactly **one** serverless function (under the Hobby 12-function limit).
