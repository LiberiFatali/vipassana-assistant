## Context

Knowledge-only requests already take the fast path in `api/chat.js` (`route.kind === "kb"`): one LLM call, a trimmed prompt built by `api/sections.js`, and no tools attached. Measured latency on the real fast-path prompt (~17-20KB) is ~10-20s total, dominated by time-to-first-token on the default `deepseek-v4-flash-free` free model (~12s TTFT). The fastest available free models still show ~5s TTFT, so no free-model choice alone gets KB answers under ~1s.

Well-defined factual queries ("Địa chỉ trung tâm Hà Nội?", "Vipassana là gì?") wait on a generative call even though the exact data already lives in `lib/centers.js` and the static knowledge base. The system prompt template (`KNOWLEDGE_SYSTEM_PROMPT`) is eval-grepped for exact phrases and must stay byte-for-byte unchanged. Existing invariants: the fast path never attaches tools, every final text passes through `sanitize_urls()`, and the tool path injects the full knowledge base.

## Goals / Non-Goals

**Goals:**
- Deterministic structured answers for common factual queries (center address/phone/email/website, bilingual "Vipassana là gì" definition) with no LLM call and <100ms latency.
- In-memory answer cache so repeated knowledge questions on a warm instance skip the LLM.
- Configurable `FAST_MODEL` for the knowledge fast path only, with a one-time fallback retry to the standard model.
- Preserve all existing invariants (no tools on fast path, `sanitize_urls()` on every output, full-KB tool path, eval-grepped system prompt unchanged).

**Non-Goals:**
- Streaming responses (would require frontend + chunked-sanitize rework; TTFT unchanged anyway).
- Changing the tool path, router, sections, or sanitizer behavior.
- Reducing latency for genuinely generative KB questions below what the free model allows; that would require paid models (explicitly out of scope).
- Persisting the answer cache across instances (in-memory only, per warm instance).

## Decisions

### D1. `FAST_MODEL` env var for the KB fast path only
`api/chat.js` reads `process.env.FAST_MODEL || "mimo-v2.5-free"` (or a faster free model chosen at implementation time after benchmarking). The KB fast-path LLM call passes this model id; the tool path and classifier keep `AGENT_MODEL`. On a fast-path LLM error, retry once with the standard `modelId` before falling back to `ERROR_RESPONSE_TEXT`.

*Alternative considered:* switching `AGENT_MODEL` globally to a faster model. Rejected — tool-calling reliability on the free deepseek model is established, and routing the tool path to an unproven model risks tool-loop failures. Keeping the split isolates the fast-path latency win.

### D2. `api/quick-answers.js` — deterministic structured answers
A new module exporting `getQuickAnswer(text, lang) → string | null`. It reuses `normalize()`/`detectLanguage()` from `api/router.js`. Matching is deliberately strict (AND of center + info keyword) to avoid false positives; anything unmatched returns `null` and falls through to the LLM fast path.

- Center detection: `virocana` / `hà nội` / `ha noi` / `hanoi` → virocana; `vutthi` / `hồ chí minh` / `ho chi minh` / `hcm` → vutthi; a plural/multi-center cue (e.g. "các trung tâm", "both centers") with no single center → both.
- Info keyword → data selection: address, phone, email, website (and schedule links where relevant). Data is read from `lib/centers.js` at request time (single source of truth, no duplication with the KB).
- Curated bilingual definition for `vipassana là gì` / `what is vipassana` / `meaning of vipassana` / `vipassana meaning`, returned in the detected language. This is a small deliberate "fast facts" layer, separate from the KB, so it does not violate the KB-as-single-source rule (it holds only the short canned definition, not a copy of SKILL.md sections).
- `maps_url` is excluded: `maps.app.goo.gl` is not in `TRUSTED_DOMAINS`, so including it would surface a "🔒 Link removed" notice in every address answer.
- Output is markdown text; `api/chat.js` still routes it through `sanitize_urls()`.

*Alternative considered:* a generic retrieval layer returning raw KB section excerpts as answers. Rejected — raw KB text is reference material, not a polished answer, and a broad matcher risks serving wrong data. The narrow curated matcher is safer and covers the observed high-frequency cases.

### D3. `api/answer-cache.js` — in-memory TTL cache
A module-level singleton `AnswerCache` mirroring the `ScheduleCache` pattern (`api/scraper/cache.js`): `Map` keyed by `lang|normalized question` → `{ answer, ts }`, TTL 24h, simple size cap (e.g. 500 entries, evict oldest) to bound memory. Exports `get(key)`, `set(key, value)`, and `clear()`. Only LLM fast-path answers are cached (deterministic quick-answers are already instant and need no cache).

*Alternative considered:* persisting to disk / Vercel KV. Rejected — over-engineering for the FAQ-repeat use case; in-memory is sufficient and keeps the change dependency-free.

### D4. Wiring order in `api/chat.js` KB branch
After `classifyIntent` returns `route.kind === "kb"`:
1. `getQuickAnswer(userText, route.lang)` → if non-null, return `sanitize_urls(quick)` immediately (no LLM).
2. Check `answerCache.get(lang + "|" + normalize(userText))` → if hit, return `sanitize_urls(cached)`.
3. Otherwise call the fast-path LLM with `FAST_MODEL` (retry once with `AGENT_MODEL` on failure), cache the result on success, return `sanitize_urls(content)`.

This ordering keeps deterministic answers cheapest, then cached, then LLM.

### D5. Tests
- New `tests/quick-answers.test.mjs`: virocana/vutthi address+phone+email+website in vi/en, both-centers case, "Vipassana là gì?" definition, `null` for non-matches (so it falls through), and confirmation the output URLs are trusted domains.
- New `tests/answer-cache.test.mjs`: set/get, TTL expiry, size-cap eviction, `clear()`.
- Update `tests/chat-path.test.mjs:59`: swap the fast-path fixture from "What is Vipassana?" (which the curated definition now answers with zero LLM calls) to a non-deterministic KB question (e.g. "What is the daily timetable during a 10-day course?"), and adjust the trimmed-prompt assertion accordingly. Add an assertion that `FAST_MODEL` (set in the test env) is the model on the fast-path request, and a test that a deterministic quick-answer (e.g. an address query) triggers no LLM call.
- Update `README.md` and `AGENTS.md` to document `FAST_MODEL`.

## Risks / Trade-offs

- [Deterministic matcher false negative] → Every unmatched question falls through to the LLM fast path; behavior is unchanged, only latency is lost for that case. Conservative matching is a feature, not a bug.
- [Deterministic matcher false positive serves wrong/outdated center data] → Data is read from `lib/centers.js`, the existing single source also used by the `get_center_info` tool; matching requires both a center and an info keyword. Address queries still pass through `sanitize_urls()`.
- [Free fast model availability/latency varies (probes showed 503s and 5-12s TTFT)] → `FAST_MODEL` is env-configurable; the default is picked from the most consistently-available benchmarked free model; failure path retries with `AGENT_MODEL` so the user still gets an answer.
- [Cached answers go stale if the KB is edited] → KB is edited in place (AGENTS.md); cache TTL (24h) bounds staleness, and the cache is in-memory so a Vercel cold start clears it. Deterministic answers read `lib/centers.js` live, so they never go stale.
- [Canned "Vipassana là gì" definition drifts from the KB narrative] → It is a deliberate, tiny, separately-maintained fast-facts string; LLM still answers if the query phrasing doesn't match, and the definition is short and factual.

## Migration Plan

- Deploy is a normal Vercel push; no schema/data migration. `FAST_MODEL` is optional; without it the KB path falls back to the `DEFAULT_FAST_MODEL` constant.
- Rollback: unset `FAST_MODEL` and/or revert `api/chat.js` wiring; the deterministic and cache modules are additive and can be left unreferenced safely.

## Open Questions

- None blocking. (Exact `DEFAULT_FAST_MODEL` value to be finalized during implementation from the benchmark probes in `tests`/manual verification.)
