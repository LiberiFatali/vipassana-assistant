# Specification: Streaming Responses

## Purpose
Incrementally deliver agent answers over Server-Sent Events (SSE) so the client renders tokens as they are generated, reducing perceived latency. Streaming is negotiated by the client; the existing non-streaming `{ text }` contract remains supported. Tool-path streaming is hardened to be robust under real-world LLM output.

## Requirements

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

### Requirement: Tool-path step classification uses all signals
The system SHALL classify each streamed tool-loop step from ALL incoming deltas (content text OR `tool_calls`), not only the first delta, so that interleaved or reordered content and tool-call fragments are neither dropped nor misrouted.

#### Scenario: Content then tool_calls in one step
- **WHEN** a streamed step emits content deltas before a `tool_calls` delta
- **THEN** the content is buffered into the assistant message and the tool calls are accumulated and executed without losing the content

#### Scenario: Fragmented tool arguments
- **WHEN** a `tool_calls` `arguments` JSON string is split across many deltas
- **THEN** the fragments are joined into a single valid call and executed exactly once

#### Scenario: No text and no tool calls
- **WHEN** a streamed step completes with neither content nor a complete tool call
- **THEN** the step is treated as degenerate and the stream emits the static bilingual `error` event rather than hanging or emitting a partial answer

### Requirement: Tool-path step-level retry
The system SHALL retry a failed streamed tool-loop step once (falling back to `AGENT_MODEL`) when the failure occurs before any `delta` or `status` has been emitted, mirroring the fast-path retry; failures after output has begun SHALL emit the static bilingual `error` event.

#### Scenario: Transient failure before output is retried
- **WHEN** a streamed tool-loop step fails before any `delta`/`status` was emitted
- **THEN** the step is retried once and, on success, the stream continues normally

#### Scenario: Failure after output is not retried
- **WHEN** a streamed tool-loop step fails after a `delta` or `status` has been emitted
- **THEN** the stream emits the static bilingual `error` event and closes

### Requirement: Bounded tool-result echoing
The system SHALL bound the size of tool results echoed back into the conversation for the next prompt, truncating oversized results (e.g. a large `list_courses` payload) to a fixed limit without dropping the response.

#### Scenario: Oversized tool result is truncated
- **WHEN** a tool execution returns a result larger than the echo limit
- **THEN** the result echoed into the next LLM call is truncated to the limit so the prompt size stays bounded

### Requirement: Bounded time-to-first-token
Streamed LLM calls SHALL abort if no delta of any kind — content, tool-call, or reasoning (`reasoning`/`reasoning_content`) — arrives within a short first-token deadline (well under the overall request timeout), so a stalled provider surfaces as a fast `error` (or fast-path retry) instead of a long silent wait. A reasoning delta SHALL count as proof the stream is alive, re-arming the first-token deadline to the overall request timeout, so a model that streams thinking before content is not falsely aborted. The overall request timeout SHALL remain the upper bound on the whole stream.

#### Scenario: Stalled model produces no first token
- **WHEN** a streamed LLM call receives no delta (content, tool-call, or reasoning) within the first-token deadline
- **THEN** the call aborts and the stream emits the static bilingual `error` event (or, on the fast path before any output, retries once) rather than waiting out the full request timeout

#### Scenario: Reasoning before content is not a stall
- **WHEN** a streamed LLM call emits `reasoning`/`reasoning_content` deltas before any content or tool-call delta, still within the first-token deadline
- **THEN** the first-token deadline is re-armed to the overall request timeout and the call continues streaming normally until content (or a real hang) follows

#### Scenario: Healthy stream is unaffected
- **WHEN** a streamed LLM call begins producing deltas within the first-token deadline
- **THEN** the call continues streaming normally and the overall request timeout still bounds the whole stream

### Requirement: Tool path streams first token promptly
The system SHALL stream the final text-generating step of the tool loop as `delta` events as soon as content begins, while tool-execution steps remain buffered until a complete call is formed.

#### Scenario: Final text streams incrementally
- **WHEN** the tool loop reaches the final text-generating step
- **THEN** content deltas are emitted incrementally through the rolling sanitizer and the stream concludes with `done`

### Requirement: Tool-path streaming preserves sanitization
Every `delta` emitted on the tool path SHALL pass through the rolling sanitizer in `lib/stream.js`, preserving the trusted-domain gate even when tool-generated content or URL fragments stream across chunks.

#### Scenario: Untrusted URL in tool-path deltas is gated
- **WHEN** tool-path `delta` text contains an untrusted URL split across chunks
- **THEN** the untrusted URL is replaced with the safety notice in the deltas and absent from the `done` event
