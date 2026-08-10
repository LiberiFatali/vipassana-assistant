# Specification: Streaming Responses

## Purpose
Incrementally deliver agent answers over Server-Sent Events (SSE) so the client renders tokens as they are generated, reducing perceived latency. Streaming is negotiated by the client; the existing non-streaming `{ text }` contract remains supported.

## ADDED Requirements

### Requirement: Streaming negotiation
The system SHALL stream `POST /api/chat` responses as SSE when the client signals streaming (via an `Accept: text/event-stream` header or a `stream=1` query parameter), and SHALL return the existing non-streaming `{ text }` JSON response when the client does not signal streaming.

#### Scenario: Client requests streaming
- **WHEN** a client POSTs to `/api/chat` with `Accept: text/event-stream`
- **THEN** the response is `text/event-stream` with incremental `delta` events followed by a final `done` event carrying the complete answer

#### Scenario: Client does not request streaming
- **WHEN** a client POSTs to `/api/chat` without a streaming signal
- **THEN** the response is the existing non-streaming JSON `{ text }` shape

### Requirement: Streamed event framing
The system SHALL frame streamed output as SSE `data:` lines. A `delta` event carries the newest chunk of answer text since the previous event. A `done` event SHALL be the last event and carry the complete, fully-sanitized answer text. An `error` event SHALL carry a static bilingual error message when generation fails mid-stream.

#### Scenario: Successful stream emits deltas then done
- **WHEN** generation succeeds and streaming is negotiated
- **THEN** the stream emits one or more `delta` events and then a single `done` event with the complete answer

#### Scenario: Mid-stream failure emits error
- **WHEN** the LLM call fails after streaming has started
- **THEN** the stream emits an `error` event with a static bilingual message and closes

### Requirement: URL sanitization on streamed output
The system SHALL apply the trusted-domain gate (`sanitize_urls()`) to every byte emitted on a streamed response, using a rolling buffer so a URL split across chunk boundaries is not cut mid-URL. The final `done` event text SHALL be fully sanitized.

#### Scenario: Untrusted URL is gated mid-stream
- **WHEN** generated output contains a URL to an untrusted domain split across multiple chunks
- **THEN** the untrusted URL is replaced with the safety notice before it is emitted, and the `done` event contains no untrusted URL

#### Scenario: Trusted URL survives streaming
- **WHEN** generated output contains a `*.vridhamma.org` or `ucenlist.org` URL split across chunks
- **THEN** the URL is emitted intact and present in the `done` event

### Requirement: Tool path streams progress and final text
The system SHALL emit `status` events while the tool loop runs (e.g. "looking up course schedules") and SHALL stream the final text-generating LLM call of the tool path as `delta` events, concluding with `done`.

#### Scenario: Tool loop streams status then final text
- **WHEN** a live-data request is streamed and the tool loop runs
- **THEN** `status` events are emitted during tool execution, followed by `delta` events for the final answer text and a closing `done` event

### Requirement: Fast path streams without tools
The KB fast path SHALL stream the single trimmed-prompt LLM call as `delta` events with no tools attached, preserving the existing invariant that the fast path never attaches tools.

#### Scenario: Knowledge question streams cleanly
- **WHEN** a knowledge-only question is streamed
- **THEN** deltas from the fast-path LLM call are emitted with no tool payload, ending in `done`

### Requirement: Client renders streaming incrementally
The frontend SHALL consume the SSE stream, append `delta` text to the in-progress agent bubble, re-render accumulated markdown incrementally (throttled), and replace it with the final `done` text. Sending a new message SHALL cancel any in-flight stream.

#### Scenario: Tokens render as they arrive
- **WHEN** the user asks a question and the server streams deltas
- **THEN** the agent bubble shows accumulated markdown that grows as deltas arrive, and settles to the `done` text

#### Scenario: New message cancels in-flight stream
- **WHEN** the user sends a new message while a stream is in progress
- **THEN** the in-flight request is aborted and the new message is processed

### Requirement: Streaming preserves safety invariants
Streaming SHALL NOT weaken existing invariants: the fast path never attaches tools, every emitted text passes through `sanitize_urls()`, and deterministic quick-answers and cached answers SHALL still be returned without an LLM call (as a single `delta`/`done` pair or the non-streaming shape).

#### Scenario: Deterministic answer short-circuits the stream
- **WHEN** a streamed request matches a deterministic quick-answer or cache entry
- **THEN** no LLM call is made and the complete answer is emitted immediately as `done` (with no tool payload)
