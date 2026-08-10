# Design: Harden tool-path streaming

## Context

`api/chat.js` has two paths. The KB fast path (`streamFastPath`) is hardened: deterministic quick-answer, answer cache, a single trimmed-prompt call with **no tools**, one retry to `AGENT_MODEL` before the first `delta`, and every byte through the rolling sanitizer in `lib/stream.js`. The tool path (`streamToolPath`) runs a loop of streamed LLM calls with the full knowledge base + full tool registry, emitting `status` events and streaming the final text step as `delta`s.

Current tool-path weaknesses:

1. **First-signal classification** (api/chat.js:452): `stepType` is locked to whatever arrives in the *first* delta of a step (`content` → text, `tool_calls` → tool). A step that emits content first and then tool calls, or the reverse, is misclassified: content is either dropped (tool branch only buffers, but if `stepType === "tool"` the content is only accumulated into `stepContent` and re-sent — OK) or, worse, interleaved content+tool_calls in a "text" step still accumulates calls correctly (api/chat.js:465-470 handles both). The real hazard: content in a tool step that arrives after `tool_calls` deltas is lost from the visible stream, and a step flagged "text" that also carries tool calls skips the final-text branch (fine) but has already streamed its content to the client.
2. **No step-level retry**: the whole tool loop aborts to the static `error` on a transient transport failure, even though nothing has been emitted yet.
3. **Unbounded tool-result echo**: scraped results (full course lists) are pushed into `apiMessages` verbatim; the next prompt grows without limit.
4. **Under-tested**: `tests/stream.test.mjs` tool-path coverage is the happy path only.

Non-goals: changing the non-streaming JSON path, the KB fast path, `lib/stream.js`, the SSE wire contract, or the tool definitions.

## Goals / Non-Goals

**Goals**
- Reliable step classification driven by all signals in a step, not just the first delta.
- One retry of a tool-loop step before any output is emitted; static `error` once output has begun.
- Bounded tool-result echo into the next prompt.
- Guaranteed sanitization of every tool-path `delta` (already true via the roller — make it a stated invariant and keep it).
- Expanded streamed tool-path test coverage.

**Non-Goals**
- No changes to the non-streaming JSON response shape or the SSE event contract.
- No changes to `lib/stream.js` internals (it is the single sanitization point).
- No new external dependencies.
- No change to `MAX_TOOL_STEPS`, timeout, or tool registry.

## Decisions

### D1. Step classification from all signals (replace the first-signal heuristic)

Classify a step only **after** the stream for that step ends, using the union of what was seen:

- If the step accumulated one or more complete tool calls → **tool step**.
- Else if it accumulated any content → **final text step**.
- Else (nothing at all) → **degenerate** → static `error`.

Buffering detail: during a step, buffer *content* into `stepContent` and always accumulate `tool_calls` via `accumulateToolCalls`. Never stream content to the client until the step is classified as the final text step. This trades a tiny amount of final-step first-token latency for correctness — we cannot know a step is "final" until it ends, and mis-streaming tool-preamble text would corrupt the answer.

Alternatives considered:
- *First-signal heuristic (current)* — rejected: fragile under interleaved deltas.
- *Stream content optimistically and roll it back* — rejected: SSE is append-only; you cannot unsend text.

Consequence: the final text step's content is buffered until the step's `finish_reason`/end, so `delta` streaming begins only when the LLM finishes that step. This still gives the user the tool-loop `status` + `delta` UX for the answer; it does not tokenize mid-step. Acceptable per requirements ("streams the final text as deltas", not "tokens as they generate").

### D2. Step-level retry mirroring the fast path

Wrap each step's streamed LLM call so that:

- On failure with **zero bytes of content emitted and zero tool calls accumulated** → retry once with `AGENT_MODEL` (the standard model), same `apiMessages`, and only if the retry also fails → static `error`.
- On failure with **any content or any tool-call fragment already accumulated** → static `error` (no retry; too late to safely repeat).

This exactly mirrors `streamFastPath`'s "retry before first delta" rule and keeps tool steps idempotent: since a retry only happens when nothing from the failed attempt was emitted or echoed, re-running the step cannot double-execute a tool.

Rationale: the fast path already established the "retry only before output" pattern; extending it to the tool loop keeps behavior uniform and gives live-data queries one chance to survive a transient LLM outage.

### D3. Bounded tool-result echo

Cap each tool result echoed into `apiMessages` with a constant `TOOL_RESULT_ECHO_MAX` (e.g. 4 KB). Truncate with a clear suffix marker (e.g. `\n…[truncated]`) so the model knows the data is incomplete. Applies at api/chat.js:502 in `streamToolPath` (and mirror it in the non-streaming loop at api/chat.js:272 for consistency).

Alternatives: truncate inside `executeToolCall` (rejected — that would corrupt the data returned to the tool caller and the model's view of tool *errors*), or rely on the model (rejected — nothing bounds prompt growth).

### D4. Sanitization invariant stays in the roller

No change to `lib/stream.js`. The design keeps every tool-path `delta` produced by the final text step flowing through `RollingSanitizer`, and the `done` text = `roller.end()`. The new tests assert this explicitly with a split untrusted URL on the tool path.

## Risks / Trade-offs

- **Later first-token on final step (D1)** → The tool loop already emits `status` frames during scraping, so perceived latency is masked; acceptable and correct-by-construction.
- **Retry could hide a model bug (D2)** → Retry is limited to one attempt and only before output; a repeated failure surfaces the static `error` as today.
- **Truncated tool results reduce answer quality (D3)** → The `…[truncated]` marker tells the model the data is partial; 4 KB is ample for course listings. Tune the constant if real prompts bloat.
- **Test flakiness from stubbed streams** → Reuse the existing deterministic SSE-frame fixture pattern in `tests/stream.test.mjs` (no network).

## Migration Plan

Pure forward-compatible refactor inside `api/chat.js` + tests:

1. Rework `streamToolPath` classification + retry + bounded echo (D1–D3).
2. Extend `tests/stream.test.mjs` with the new scenarios.
3. `npm test` green (existing 104 + new cases) and a manual dev-server smoke test of a streamed live-data question.
4. Rollback: revert the single-file change; wire contract and libs are untouched.

## Open Questions

- None blocking. The `TOOL_RESULT_ECHO_MAX` value (4 KB) and the exact truncation suffix are implementation details to confirm during apply.
