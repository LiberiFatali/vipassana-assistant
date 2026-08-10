# Design: Fix reasoning-model timeouts

## Context

The agent's LLM calls (classifier, KB fast path, tool loop) all use a single model id resolved as `AGENT_MODEL > FAST_MODEL > DEFAULT_MODEL`, currently defaulting to `mimo-v2.5-free`. On OpenCode Zen, `mimo-v2.5-free` now behaves as a reasoning model: a normal chat call produces zero `content`/`tool_calls` deltas for ~30s while emitting only `reasoning`/`reasoning_content` deltas. The streaming first-token watchdog (`FIRST_TOKEN_TIMEOUT_MS`, default 50s) aborts any call that produces no content/tool-call delta within the deadline, so every LLM-dependent question dies with the static bilingual `error`. Non-deterministic KB questions ("Tôi nên chuẩn bị gì cho khóa thiền?", "Giới thiệu về thiền Vipassana") surface this; deterministic questions hide it.

Measured on the live endpoint: `mimo-v2.5-free` first content ~30s; `deepseek-v4-flash-free` and `nemotron-3-ultra-free` first content ~5.4s. The classifier additionally sends `max_tokens: 8`, which reasoning models burn entirely on `reasoning_content` — a meaningful classifier call is not achievable within its 2.5s timeout.

## Goals / Non-Goals

**Goals:**
- Make every LLM-dependent question answerable again (no false first-token aborts).
- Keep time-to-first-token bounded so a genuinely stalled provider still fails fast.
- Make the curated Vipassana definition answer "Giới thiệu về thiền Vipassana" without an LLM.
- Zero new dependencies; no API shape / SSE contract / safety-model changes.

**Non-Goals:**
- No classifier redesign (its conservative tools-default remains and succeeds on the fixed model).
- No deterministic answer for "chuẩn bị gì" — SKILL.md has no preparation/packing content to embed.
- No change to the tool registry, scraper, sanitizer, or `lib/stream.js` internals.

## Decisions

### D1. Switch default model to `deepseek-v4-flash-free`
Change `DEFAULT_MODEL` in `api/chat.js` from `mimo-v2.5-free` to `deepseek-v4-flash-free`. Measured ~5.4s to first content — comfortably under the 10s watchdog — and it was the project's original default before the single-fast-model consolidation. `AGENT_MODEL`/`FAST_MODEL` env overrides still win. `nemotron-3-ultra-free` measured equally fast; `deepseek-v4-flash-free` is preferred because the repo was built around it (see `2026-08-03-deploy-on-vercel/design.md`).

*Alternative considered:* raising the first-token timeout to >30s to keep `mimo-v2.5-free`. Rejected — a ~30s silent wait (with retry) risks exceeding Vercel's 60s `maxDuration` and is a poor UX, and the model's reasoning is not useful for these short answers.

### D2. Count reasoning deltas as stream liveness
In `streamChatCompletion`, the first-delta check (`firstDeltaSeen`) currently only fires on `delta.content` or `delta.tool_calls`. Treat `delta.reasoning` and `delta.reasoning_content` as liveness too: re-arm the watchdog to the 50s `LLM_TIMEOUT_MS` overall bound. A slow-to-content reasoning model no longer gets falsely aborted at 10s, while a model that emits nothing at all still fails fast.

*Alternative considered:* raising `FIRST_TOKEN_TIMEOUT_MS`. Rejected — the model emits reasoning fast (for `deepseek-v4-flash-free`, immediately), so liveness-based re-arming is strictly more precise and future-proof than a global timeout bump.

### D3. Widen the curated-definition trigger
Add `thiền vipassana` / `thien vipassana` to the definition trigger list in `lib/quick-answers.js`. This is a substring match on normalized (diacritic-stripped) text, so "Giới thiệu về thiền Vipassana" hits it directly. Low hijack risk: a mention of "thiền Vipassana" warrants the definition, same as the existing broad triggers.

### D4. Document the classifier's conservative default
Add a comment in `lib/router.js` explaining why `CLASSIFIER_TIMEOUT_MS`/`CLASSIFIER_MAX_TOKENS` stay as-is: reasoning models consume the 8-token budget on `reasoning_content`, so the 2.5s timeout always fires and routing falls back to the conservative tools path — which succeeds now that the model is fast. No code behavior change.

## Risks / Trade-offs

- **[`deepseek-v4-flash-free` free tier availability/rate limits change again]** → `AGENT_MODEL` env override remains the escape hatch (documented in README); the liveness re-arm (D2) means a future slower reasoning model degrades to slower answers, not errors.
- **[Reasoning-liveness re-arm lets a talky-but-useless reasoning model hold the stream past 10s]** → The 50s overall bound still caps total stream time, and the fast path's first-token abort/retry semantics are preserved for truly silent models.
- **[Wider definition trigger misroutes an intent to the definition]** → Matching stays substring-strict and scoped to Vipassana noun phrases; a false-negative (LLM fallback) only costs latency.

## Migration Plan

1. Apply D1–D4 with `npm test` green throughout (tests do not reference the default model id).
2. Manual smoke both failing queries over `npm run dev` (SSE + JSON), confirming real answers well under the 60s cap.
3. If `AGENT_MODEL` is set in Vercel production env, verify it is not a slow reasoning model; otherwise the shipped default applies.
4. Rollback: revert the four touched files; changes are additive and locally scoped.

## Open Questions

None.
