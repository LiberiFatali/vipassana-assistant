# Specification: Streaming Responses

## Purpose
Extend the tool-path streaming requirements to be robust under real-world LLM output: reliable step classification from all signals, step-level retry, bounded tool-result echoing, and guaranteed sanitization of every streamed `delta`.

## ADDED Requirements

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
