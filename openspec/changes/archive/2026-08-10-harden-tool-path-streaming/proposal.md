## Why

The tool-path streaming loop (`streamToolPath`) works for the happy path but is fragile under real-world LLM output: fragmented/oddly-ordered tool-call deltas can misclassify a step and drop text, a transient step failure aborts the whole stream to the static error (no retry, unlike the fast path), and large scraped tool results are echoed back into the next prompt unbounded. It is also under-tested — `tests/stream.test.mjs` covers only the clean single-tool-call case.

## What Changes

- Robust tool-call accumulation: classify each step from ALL signals (content OR tool_calls), not just the first delta; handle fragmented `arguments` reliably and never drop interleaved content.
- Step-level retry on the tool path: transient streaming failures retry once (to `AGENT_MODEL`) before any `delta`/`status` is emitted, mirroring the fast-path fallback; tool *execution* errors already return JSON to the model and stay non-fatal.
- Tool-result echo hygiene: bound the size of tool results echoed back into `apiMessages` so a large `list_courses` result cannot balloon the next prompt.
- Improved first-`delta` latency: keep tool-loop steps buffered, but ensure the final text-generating step streams as soon as content starts.
- Expanded `tests/stream.test.mjs` coverage: fragmented tool args, mid-stream tool error, step cap, mixed content+tool_calls, and a tools-only response with no final text.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- `streaming-responses`: extend the tool-path streaming requirements — reliable multi-signal step classification, step-level retry, bounded tool-result echoing, and the guarantee that every `delta` on the tool path still passes through the rolling sanitizer.

## Impact

- `api/chat.js` — `streamToolPath`, `accumulateToolCalls`, the streaming tool loop; no change to the non-streaming JSON path or the KB fast path.
- `lib/stream.js` — unchanged (rolling sanitizer stays the single sanitization point).
- `tests/stream.test.mjs` — new/updated tool-path streaming scenarios (stubbed fetch, no network).
- No dependency or API surface changes; `POST /api/chat` request/response contract is unchanged.
