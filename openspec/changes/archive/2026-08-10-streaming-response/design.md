## Context

`POST /api/chat` is currently non-streaming: `api/chat.js` runs the full response path (router → fast path or tool loop) and returns a single `Response.json({ text })`. The frontend (`public/index.html`) shows a "thinking" indicator, awaits `res.json()`, then renders the whole message. Measured earlier, TTFT is ~5-12s on free models, so users stare at a spinner for most of that time even though tokens start flowing earlier.

Streaming adds perceived-latency improvement with no change to correctness: the same router, prompts, tools, cache, and `sanitize_urls()` backstop are reused; only the transport changes. Constraints that shape the design:
- AGENTS.md invariant: **every emitted text must pass through `sanitize_urls()`**. Per-chunk sanitize breaks URLs split across chunk boundaries, so a rolling buffer is required.
- The KB fast path must never attach tools; the tool path must keep the full knowledge base; deterministic quick-answers and the answer cache must keep short-circuiting the LLM.
- The eval suite and existing clients rely on the non-streaming `{ text }` shape — it stays.
- Zero new dependencies (project convention: no build step, dependency-free frontend).
- Vercel Hobby limits each deployment to **12 serverless functions**, and every `.js` file under `api/` (including subdirectories) counts as one. The current 14-file `api/` tree exceeds the cap and blocks deploys, so this change relocates all helper modules to `lib/` and keeps `api/chat.js` as the only function (see D10).

## Goals / Non-Goals

**Goals:**
- Negotiable SSE streaming on `POST /api/chat` (opt-in via `Accept: text/event-stream` or `?stream=1`), with `status` / `delta` / `done` / `error` events.
- Stream the KB fast-path LLM call token-by-token; stream the tool loop's final text-generating call with `status` events during tool execution.
- Rolling URL sanitization so untrusted URLs are gated on streamed output without cutting trusted URLs mid-token.
- Frontend incremental markdown rendering with in-flight abort.
- Full test coverage; existing non-streaming tests unchanged.

**Non-Goals:**
- Replacing the non-streaming contract or removing backward compatibility.
- Streaming the classifier call or tool-execution internals (only status + final text are streamed).
- Changing prompts, routing, tools, sanitizer, or model selection.
- Persisting streamed state across requests.

## Decisions

### D1. Streaming negotiation via `Accept` header (with `?stream=1` fallback)
`api/chat.js`'s `POST` checks `request.headers.get("accept")?.includes("text/event-stream")` OR the `stream=1` query param. If negotiated, it returns `Response` with `Content-Type: text/event-stream` and an SSE body; otherwise it returns the existing JSON `{ text }`.

*Alternative considered:* always stream. Rejected — the eval suite (`tests/chat-path.test.mjs`) and any external client expect JSON; making streaming opt-in keeps those intact and testable.

### D2. SSE framing: one JSON payload per `data:` line
Events use standard SSE framing: `event: <name>\ndata: <json>\n\n`. Event names:
- `status` — tool-loop progress (e.g. `{ message: "Looking up course schedules…" }`), bilingual.
- `delta` — `{ text: "<newest chunk>" }`; the client appends it.
- `done` — `{ text: "<complete sanitized answer>" }`; always the last event.
- `error` — `{ text: "<static bilingual error>" }`; sent on mid-stream failure.

*Alternative considered:* raw token chunks (`text/plain`). Rejected — JSON events let us carry the final authoritative `done` text and error/status semantics cleanly, and the SSE `data:` framing is trivial to parse with the existing zero-dependency frontend.

### D3. `lib/stream.js` — SSE writer + rolling sanitizer
New module exporting a small `SSEWriter` class (wraps a `WritableStreamDefaultWriter`) and a rolling-sanitize helper. It lives in `lib/` (not `api/`) so it is not built as a serverless function (see D10). Rolling sanitize algorithm:
- Maintain `rawBuffer` (all generated text so far) and `sanitizedEmitted` (the sanitized prefix already sent).
- On each new chunk: append to `rawBuffer`; compute a safe cut point at the last URL-terminator character (`\s`, `)`, `]`, `"`, `'`), clamped to a max pending window (4096 chars) to bound memory; `committed = rawBuffer.slice(0, cut)`.
- `sanitized = sanitize_urls(committed)`; emit the increment `sanitized.slice(sanitizedEmitted.length)` as a `delta`; update `sanitizedEmitted`.
- On `end()`: sanitize the entire `rawBuffer` (handles a trailing URL with no terminator), emit any remaining increment, then emit `done` with the full sanitized text.

This keeps every emitted byte behind the trusted-domain gate while never splitting a URL. Prefix-stability holds because previously-committed text is already sanitized (idempotent) and the committed prefix only grows.

*Alternative considered:* sanitizing each raw chunk independently. Rejected — a URL like `https://evil.com/x` split as `https://evi` + `l.com/x` would be mangled (partial replacement notice + leaked suffix). The rolling buffer is the only way to preserve the invariant.

### D4. Streaming LLM call (`streamChatCompletion`)
New async generator in `api/chat.js` (the SSE writer/framing stays in `lib/stream.js`): POSTs to the Zen chat-completions endpoint with `stream: true`, parses the provider's own SSE, and yields `{ delta }` for each content piece (and `{ toolCalls }` accumulations where relevant). Uses the same `AbortController` + `LLM_TIMEOUT_MS` pattern as `callChatCompletion`.

### D5. Fast path streams its single call
For `route.kind === "kb"` with streaming negotiated:
1. Deterministic quick-answer → emit `done` immediately (no LLM, no tools), still sanitized.
2. Cache hit → emit `done` immediately (no LLM).
3. Otherwise: stream the fast-path LLM call (`FAST_MODEL`, no tools, trimmed prompt, fallback retry to `AGENT_MODEL`) as `delta` events; on completion cache the answer and emit `done`.

No tools are attached on this path (invariant preserved). Retry-on-failure works by buffering the streamed text until the call completes, or by failing over before the first `delta` is emitted.

### D6. Tool path streams status + final text
The tool loop runs as today (non-streaming calls) but:
- Emits a `status` event before tool execution and after each tool result.
- The final text-generating step uses a **streaming** call: run the loop until a response arrives with no `tool_calls`; that response is generated with `stream: true` so its content is forwarded as `delta` events.

To know which step is final, the loop iterates up to `MAX_TOOL_STEPS`; on the step whose streamed response contains no tool calls, forward content deltas; if it contains tool calls, execute them and continue (emitting `status`). A first-signal heuristic (content vs `tool_calls` in the initial provider deltas) decides forward-vs-buffer per step; tool calls are accumulated from streamed deltas and executed exactly once.

*Alternative considered:* streaming nothing on the tool path (just JSON). Rejected — the spec requires status + final-text streaming, and it materially improves the live-data UX.

### D7. Frontend: SSE reader + incremental markdown rendering
`public/index.html` `sendMessage()`:
- Requests streaming by default (`Accept: text/event-stream`).
- Uses `fetch` + `res.body.getReader()`; a small SSE line parser splits `event:`/`data:` frames.
- On `delta`: append to an in-memory buffer and schedule a re-render of the accumulated text through `renderMarkdown` via `requestAnimationFrame` (throttle; don't re-render on every chunk).
- On `done`: render the final text once, push `{ role: "assistant", content }` to history, save.
- On `error`/network failure: show the bilingual error message.
- Keep an `AbortController` per request; abort on new message send and on "Clear chat".
- The "thinking" indicator stays visible until the first `delta`/`status`/`done` arrives.

Re-rendering the accumulated buffer (not per-delta DOM diffing) is simplest and robust: `renderMarkdown` is stateless and cheap for the short answers this bot produces. `markdown.js` is unchanged — it already gates links client-side.

*Alternative considered:* Server-Sent Events via `EventSource`. Rejected — `EventSource` can't send a POST body, and this endpoint needs `messages`. Fetch + reader is required.

### D8. `server.js` streams the proxy
The local dev server currently buffers `await response.text()`. Update the `/api/chat` branch to forward `Content-Type`, copy `response.status`, and pipe `response.body` (a web ReadableStream) into the Node `res` via an async iterator. Non-streaming responses still work (single chunk).

### D9. Tests
- `tests/stream.test.mjs` (new): stub `fetch` to return a web `ReadableStream` that yields SSE provider chunks; assert: negotiation produces `text/event-stream`; `delta` events arrive incrementally; `done` carries the complete sanitized text; an untrusted URL split across chunks is replaced by the notice in both the deltas and `done`; a trusted URL split across chunks survives; a deterministic quick-answer short-circuits to `done` with no LLM call; a mid-stream provider error emits `error`.
- `tests/chat-path.test.mjs`: unchanged (non-streaming default still returns JSON).

### D10. `api/` holds exactly one function; helpers live in `lib/`
Vercel's Hobby plan rejects deployments with more than 12 serverless functions, and the Node.js runtime builds a function from **every `.js` file under `api/`**, including subdirectories. The current tree has 14 (`chat.js`, `answer-cache.js`, `knowledge.js`, `normalize.js`, `quick-answers.js`, `router.js`, `sanitize.js`, `sections.js`, `system-prompt.js`, `scraper/{cache,vri-schedule}.js`, `tools/{get-center-info,get-course-details,list-courses}.js`), so deploys fail. This change moves all non-endpoint modules to `lib/`:

- `api/{system-prompt,knowledge,sanitize,normalize,router,sections,quick-answers,answer-cache}.js` → `lib/`
- `api/scraper/{cache,vri-schedule}.js` → `lib/scraper/`
- `api/tools/{get-center-info,get-course-details,list-courses}.js` → `lib/tools/`

Only `api/chat.js` remains, and the new streaming helper is created directly at `lib/stream.js`. `vercel.json` (`functions.api/chat.js`) and `server.js` (`./api/chat.js`) are unaffected. Intra-`lib` relative imports keep working: `lib/tools/*` still reach `lib/scraper/*` via `../scraper/`, `lib/quick-answers.js` and `lib/tools/get-center-info.js` reach `lib/centers.js` via `./centers.js` / `../centers.js`, and `api/chat.js` imports everything as `../lib/*`. Test imports change from `../api/*` to `../lib/*` (except `../api/chat.js`).

*Alternative considered:* keeping helpers in `api/` and relying on `vercel.json` `builds` to ignore them. Rejected — there is no supported config to exclude files from `api/`; moving them out is the documented fix and keeps a single deployable function.

## Risks / Trade-offs

- [Rolling sanitizer can briefly delay a trailing token until the next chunk or stream end] → Pending window bounded to 4096 chars; the delay is one chunk at most and is invisible in practice; correctness is guaranteed at `done`.
- [Tool-path first-signal heuristic could misclassify content vs tool_calls] → Tool-calling models emit `tool_calls` deltas before content; the buffer-then-forward logic only streams content after the response is known to contain none. Any ambiguity falls back to buffering the step (correct, just less incremental).
- [Free-model provider streaming can stall or 503] → Same error handling as non-streaming: fallback retry to `AGENT_MODEL` on the fast path before any `delta` is emitted; static bilingual `error` event on mid-stream failure.
- [Frontend re-render thrash on long answers] → rAF-throttled re-render of the accumulated buffer; answers are short (≤2KB), so cost is negligible.
- [Vercel streaming timing] → Function already returns web `Response`; streaming responses are supported and `maxDuration` stays 60s.

## Migration Plan

- Deploy as a normal Vercel push. Existing clients that don't send the streaming signal keep the exact current JSON behavior; the frontend is updated in the same change to request streaming.
- Rollback: revert the frontend to `res.json()` usage and/or the negotiation check; non-streaming path is untouched, so a rollback is a single-commit revert with no data migration.

## Open Questions

- None blocking. Exact bilingual `status` message strings will be finalized during implementation.
