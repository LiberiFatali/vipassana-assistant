## Why

The default model `mimo-v2.5-free` on OpenCode Zen has become a slow reasoning model: it emits ~30s of `reasoning`/`reasoning_content` deltas before any content token. The streaming first-token watchdog (10s) aborts these calls as timeouts, so every LLM-dependent question — e.g. "Tôi nên chuẩn bị gì cho khóa thiền?" and "Giới thiệu về thiền Vipassana" — fails with the static bilingual error instead of an answer. Questions that hit the deterministic no-LLM shortcuts still work, masking the failure.

## What Changes

- **Switch the default model** from `mimo-v2.5-free` to `deepseek-v4-flash-free` (measured ~5.4s to first content token, well under the 10s watchdog; it was the project's original default).
- **Harden the first-token watchdog** in `streamChatCompletion` so a `reasoning`/`reasoning_content` delta counts as proof the stream is alive (re-arming the overall 50s bound). A slow-to-content reasoning model is no longer falsely aborted; the 50s bound still guards real hangs.
- **Widen the curated-definition trigger** in `lib/quick-answers.js` to include `thiền vipassana` / `thien vipassana`, so "Giới thiệu về thiền Vipassana" (with `thiền` inserted) returns the curated answer in <100ms with no LLM call.
- **Document (comment only)** why the LLM intent classifier keeps its conservative 2.5s → tools default: free reasoning models consume the `max_tokens: 8` budget on reasoning, so a meaningful classifier call is not achievable within budget; the tools path succeeds with the fixed model.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `streaming-responses`: the Bounded time-to-first-token requirement now treats reasoning deltas as stream liveness, not just content/tool-call deltas.
- `fast-kb-answers`: the Curated bilingual definition requirement now matches `thiền vipassana` / `thien vipassana` paraphrase variants.

## Impact

- `api/chat.js` — `DEFAULT_MODEL` default value; first-token liveness check in `streamChatCompletion`.
- `lib/quick-answers.js` — definition trigger list.
- `lib/router.js` — comment documenting the classifier's conservative default.
- `AGENTS.md` / `README.md` — default model references.
- No API shape, SSE event contract, or safety-model changes. `tests/*` do not reference the default model id.
