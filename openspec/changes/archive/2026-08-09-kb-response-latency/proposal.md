## Why

Knowledge-only ("KB fast path") answers still take 10-20s even though the request already skips the classifier and runs a single trimmed-prompt LLM call. The bottleneck is the LLM call itself: the default `deepseek-v4-flash-free` model has ~12s time-to-first-token (provider-side queueing on the free tier), and no free model gets KB answers under ~1s. Users with well-defined factual questions (center address, phone, contact, "Vipassana là gì?") wait for a slow generative call even though the exact data already sits in `lib/centers.js` and the knowledge base.

## What Changes

- Add a configurable `FAST_MODEL` env var used only on the KB fast path (default a faster free model than the tool-path default), with a one-time retry fallback to `AGENT_MODEL` if the fast model fails.
- Add a deterministic structured-answer layer (`api/quick-answers.js`) that answers high-confidence factual queries (center address/phone/email/website for Dhamma Virocana and Dhamma Vutthi, plus a curated bilingual "Vipassana là gì / What is Vipassana" definition) in <100ms with **no LLM call**, sourced from `lib/centers.js`. Anything not confidently matched falls through to the LLM fast path unchanged.
- Add an in-memory answer cache (`api/answer-cache.js`) keyed by `lang|normalized question`, so repeated FAQ questions return instantly on warm instances (mirrors the existing `ScheduleCache` TTL pattern).
- Keep all existing invariants: the fast path never attaches tools, every response path still passes through `sanitize_urls()`, and the tool path still injects the full knowledge base.
- Keep the `KNOWLEDGE_SYSTEM_PROMPT` template string byte-for-byte unchanged (evals grep it for exact phrases).

## Capabilities

### New Capabilities
- `fast-kb-answers`: Instant (no-LLM) structured answers for common factual questions, an in-memory answer cache for repeated questions, and a configurable faster model for the KB fast path — with the same safety gating (sanitize, no tools, full-KB tool path) as today.

### Modified Capabilities
<!-- No spec-level requirement changes. The existing chatbot-agent requirements (Bilingual Knowledge Retrieval, Safe Domain Gating, HITL registration) remain as-is; this change only alters the latency profile of how static answers are produced. -->

## Impact

- **Code (new):** `api/quick-answers.js`, `api/answer-cache.js`
- **Code (modified):** `api/chat.js` (FAST_MODEL selection, quick-answer + cache wiring, fallback retry), `tests/chat-path.test.mjs` (swap fast-path fixture to a non-deterministic question)
- **Code (tests, new):** `tests/quick-answers.test.mjs`, `tests/answer-cache.test.mjs`
- **Docs:** `README.md`, `AGENTS.md` (document `FAST_MODEL`)
- **Untouched:** `api/system-prompt.js`, `api/router.js`, `api/sections.js`, `api/sanitize.js`, `api/scraper/*`, `lib/centers.js`, `lib/fallback-schedule.json`
- **API:** public surface stays `POST /api/chat → { text }`; response shape unchanged.
