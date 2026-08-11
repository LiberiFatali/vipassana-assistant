# Design Document: Remove Streaming Response

## Context & Architecture
`POST /api/chat` previously supported both standard JSON responses and SSE streaming responses when requested via `Accept: text/event-stream` or `?stream=1`. Streaming required incremental rolling URL sanitization (`lib/stream.js`), first-token watchdog timers, and SSE event handling in `public/index.html`.

This design document outlines returning the system to a single non-streaming JSON endpoint contract.

## Key Design Decisions

### D1: Single Response Model (`{ text }`)
- Endpoint: `POST /api/chat`
- Response: `Content-Type: application/json`, body `{ text: string }`
- Errors: Returns status 400/403/405/413/429/500 with `{ error: string }`, or fallback apology string in `{ text }`.

### D2: URL Sanitization Invariant
- Every complete response text is passed through `sanitize_urls()` immediately prior to serialization into JSON response payload `{ text }`.

### D3: Simplified Client Logic
- `public/index.html` sends standard `POST` fetch with `Content-Type: application/json`.
- Displays `I18N[lang].thinking` while the promise is pending.
- Renders `renderMarkdown(data.text)` upon completion.

### D4: Cleanup of Obsolete Code
- Deleted `lib/stream.js` and `tests/stream.test.mjs`.
- Deleted `openspec/specs/streaming-responses`.
