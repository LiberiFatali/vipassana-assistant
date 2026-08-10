## 0. Relocate helpers out of `api/` (Vercel 12-function limit)

^- [x] 0.1 Move the non-endpoint modules: `api/{system-prompt,knowledge,sanitize,normalize,router,sections,quick-answers,answer-cache}.js` → `lib/`, `api/scraper/{cache,vri-schedule}.js` → `lib/scraper/`, `api/tools/{get-center-info,get-course-details,list-courses}.js` → `lib/tools/`, leaving only `api/chat.js`
^- [x] 0.2 Update `api/chat.js` imports to `../lib/*` (including `../lib/tools/*`)
^- [x] 0.3 Fix intra-lib relative imports: `lib/quick-answers.js` (`../lib/centers.js` → `./centers.js`), `lib/tools/get-center-info.js` (`../../lib/centers.js` → `../centers.js`); confirm `lib/tools/*` ↔ `lib/scraper/*` imports still resolve
^- [x] 0.4 Update `tests/*.test.mjs` imports from `../api/*` → `../lib/*` (keep `../api/chat.js`)
^- [x] 0.5 `npm test` stays green after the move
^- [x] 0.6 Confirm `find api -name '*.js'` returns only `api/chat.js` (exactly 1 serverless function)

## 1. Streaming infrastructure (`lib/stream.js`)

^- [x] 1.1 Create `lib/stream.js` with a zero-dependency SSE writer (`SSEWriter` class wrapping a `WritableStreamDefaultWriter`) providing `send(event, data)` and a `close()` that emits `data: [DONE]`
^- [x] 1.2 Implement the rolling sanitizer helper: maintain `rawBuffer` + `sanitizedEmitted`; on each chunk compute a safe cut at the last URL-terminator (`\s`, `)`, `]`, `"`, `'`) clamped to a 4096-char pending window; emit only the new `sanitize_urls(committed)` increment as `delta`
^- [x] 1.3 Implement `end()` to sanitize the full `rawBuffer` (handles a trailing URL with no terminator), flush the remaining increment, and emit `done` with the complete sanitized text
^- [x] 1.4 Add an `error()` helper emitting a static bilingual `error` event

## 2. Streaming LLM call

^- [x] 2.1 Add `streamChatCompletion(apiMessages, apiKey, modelId, options)` async generator in `api/chat.js` that POSTs with `stream: true` and yields `{ delta }` content pieces (same `AbortController` + `LLM_TIMEOUT_MS` pattern as `callChatCompletion`)
^- [x] 2.2 Ensure the generator propagates transport/non-2xx errors by throwing (so callers can fall back before any `delta` is emitted) and, on the tool path, accumulates `tool_calls` fragments from provider deltas and yields them as a complete call when finished

## 3. Streaming negotiation in `api/chat.js`

^- [x] 3.1 In `POST`, detect streaming via `Accept: text/event-stream` header or `?stream=1` query param and branch to a streaming response path returning `Content-Type: text/event-stream`; keep the non-streaming JSON `{ text }` path unchanged
^- [x] 3.2 Add a `StreamResponse`/writer plumbing helper that constructs a web `ReadableStream` whose controller writes SSE frames and ends with the `done` event
^- [x] 3.3 Refactor `generateAgentResponse` (or add a parallel `generateAgentStream`) so the KB fast path streams: deterministic quick-answer → emit `done` immediately (no LLM, no tools); cache hit → emit `done` immediately; otherwise stream the `FAST_MODEL` call (no tools, trimmed prompt, one retry to `AGENT_MODEL` before the first `delta`) through the rolling sanitizer, cache the complete answer, then emit `done`
^- [x] 3.4 Verify the KB fast path still never attaches tools and every emitted byte passes through the sanitizer

## 4. Tool-path streaming

^- [x] 4.1 Emit a bilingual `status` event before tool execution and after each tool result during the tool loop
^- [x] 4.2 Use the streaming LLM call for the loop's final text-generating step (content-only response, no `tool_calls`), forwarding content as `delta` events through the rolling sanitizer; keep tool-execution steps as buffered streaming calls that accumulate `tool_calls` and execute them exactly once
^- [x] 4.3 Keep the full knowledge base and full tool registry on this path; on step cap or mid-stream failure emit the static `error` event instead of leaking raw errors

## 5. Frontend streaming (`public/index.html`)

^- [x] 5.1 Request streaming in `sendMessage()` (`Accept: text/event-stream`) and switch from `res.json()` to `res.body.getReader()` with an SSE frame parser (split `event:`/`data:` lines)
^- [x] 5.2 On `delta`: append to an in-progress buffer and re-render accumulated markdown via `renderMarkdown` throttled with `requestAnimationFrame`; keep the "thinking" indicator visible until the first `delta`/`status`/`done`
^- [x] 5.3 On `status`: show the progress message (optional, in the active bubble)
^- [x] 5.4 On `done`: render the final text once, push `{ role: "assistant", content }` to history, and save
^- [x] 5.5 On `error`/abort/network failure: display the bilingual error and remove the thinking indicator
^- [x] 5.6 Hold an `AbortController` per request; abort the in-flight stream on new message send and on "Clear chat"

## 6. Local dev server proxy (`server.js`)

^- [x] 6.1 In the `/api/chat` branch, forward `response.status` + `Content-Type` and pipe `response.body` (web ReadableStream) into the Node `res` via an async iterator instead of `await response.text()`, so SSE flows through in dev
^- [x] 6.2 Keep non-streaming JSON responses working through the same proxy

## 7. Tests and docs

^- [x] 7.1 Create `tests/stream.test.mjs`: assert negotiation yields `text/event-stream`; `delta` events arrive incrementally; `done` carries the complete sanitized text; an untrusted URL split across chunks is replaced by the notice in deltas and `done`; a trusted `*.vridhamma.org`/`ucenlist.org` URL split across chunks survives intact; a deterministic quick-answer short-circuits to `done` with no LLM call; a mid-stream provider failure emits `error`
^- [x] 7.2 Confirm existing suites still pass unchanged (`npm test` — non-streaming default must still return JSON `{ text }`)
^- [x] 7.3 Document the streaming negotiation (header/param, event shapes) in `README.md` and update the request-flow/architecture notes in `AGENTS.md` (including the `api/ → lib/` layout change)
^- [x] 7.4 Run the full suite (`npm test`) and a manual local-dev smoke test of both streaming and non-streaming paths
