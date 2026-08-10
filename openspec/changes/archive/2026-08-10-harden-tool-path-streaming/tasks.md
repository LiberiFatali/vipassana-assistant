## 1. Tool-path step classification (D1)

- [x] 1.1 Replace the first-signal `stepType` heuristic in `streamToolPath` (api/chat.js:441-471) with post-step classification: buffer content into `stepContent` and always accumulate `tool_calls` during the step; after the stream ends, classify as final-text if content and no complete tool calls, tool-step if any complete tool call, else degenerate
- [x] 1.2 Ensure tool-step content that arrives interleaved with `tool_calls` is preserved in the echoed assistant message (`stepContent`), not dropped
- [x] 1.3 Ensure the degenerate case (no content and no complete tool call) emits the static `error` event and returns without hanging

## 2. Step-level retry (D2)

- [x] 2.1 Wrap each tool-loop step's streamed LLM call so a failure with zero emitted content and zero accumulated tool calls retries once with `AGENT_MODEL` (same `apiMessages`)
- [x] 2.2 On retry failure, or on any failure after content/tool-call fragments accumulated, emit the static `error` event (no retry, no double tool execution)
- [x] 2.3 Confirm the tool-execution branch (`executeToolCall`) stays outside the retry wrapper so tool errors remain non-fatal JSON returned to the model

## 3. Bounded tool-result echo (D3)

- [x] 3.1 Add a `TOOL_RESULT_ECHO_MAX` constant (e.g. 4 KB) and a helper that truncates a tool result string with a `…[truncated]` marker
- [x] 3.2 Apply the truncation when echoing tool results into `apiMessages` in `streamToolPath` (api/chat.js:502)
- [x] 3.3 Mirror the same truncation in the non-streaming tool loop (api/chat.js:272) for consistency
- [x] 3.4 Confirm truncation happens at the echo point only — `executeToolCall` still returns full results to the tool caller

## 4. Tests (streamed tool path)

- [x] 4.1 Add a test: a tool-path step emitting content deltas before a `tool_calls` delta still accumulates and executes the call with content preserved
- [x] 4.2 Add a test: `tool_calls` `arguments` fragmented across many deltas are joined into one call executed exactly once
- [x] 4.3 Add a test: a streamed step failure with no output retries once (`AGENT_MODEL` used on retry) and completes successfully
- [x] 4.4 Add a test: a failure after a `delta`/`status` has been emitted produces the static `error` event with no `done`
- [x] 4.5 Add a test: an oversized tool result is truncated in the next LLM request body
- [x] 4.6 Add a test: an untrusted URL split across chunks in the final text step is gated in the tool-path `delta`s and absent from `done`
- [x] 4.7 Add a test: a tools-only step with no final text still terminates (step cap or degenerate `error`, never a hang)

## 5. Verification

- [x] 5.1 `npm test` passes (existing 104 + new tool-path streaming tests)
- [x] 5.2 Manual dev-server smoke test: streamed live-data question emits `status` then `delta` then `done`; non-streaming JSON path unchanged
- [x] 5.3 Confirm no changes to `lib/stream.js`, the SSE wire contract, the KB fast path, or the tool registry
