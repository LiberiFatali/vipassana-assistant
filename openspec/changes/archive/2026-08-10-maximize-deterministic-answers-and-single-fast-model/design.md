# Design: Maximize deterministic answers and use a single fast model

## Context

The chatbot has three response layers: (1) deterministic no-LLM answers (`lib/quick-answers.js` for the knowledge path, `lib/schedule-answers.js` for windowed schedule queries), (2) the KB fast path (single trimmed-prompt LLM call, no tools, `FAST_MODEL`), and (3) the tool loop (full KB + tools, `AGENT_MODEL`). Deterministic layers short-circuit to a `done` event in <100ms; everything else pays LLM latency.

Observed failure: rephrasing a known question (e.g. "kể cho tôi về Vipassana" vs the exact "Vipassana là gì") misses the strict keyword matchers and falls into the LLM path, where free flash models can spend tens of seconds on `reasoning_content` before any content token, or stall entirely — the client shows "thinking" and then either times out (50s) or emits the static `error`. Additionally, two model tiers (`FAST_MODEL` `mimo-v2.5-free`, `AGENT_MODEL` `deepseek-v4-flash-free`) mean the classifier and tool loop run on the slower default even though the static KB + deterministic schedule path already covers almost all content; only course-schedule synthesis is truly dynamic.

Constraints preserved: the fast path never attaches tools; every emitted byte passes through `sanitize_urls()` (via `lib/stream.js` for streaming); the tool path keeps the full knowledge base; the non-streaming `{ text }` contract and the SSE wire contract are unchanged.

## Goals / Non-Goals

**Goals**
- Make common paraphrases of knowledge and schedule questions deterministic (no LLM) so the "few words changed → long wait" symptom disappears.
- Collapse LLM usage onto a single fast model for classifier, fast path, tool loop, and retries.
- Bound time-to-first-token so a stalled model produces a quick `error`/retry instead of a 50s silent wait.
- Zero new dependencies; streaming and non-streaming paths stay in sync.

**Non-Goals**
- No change to the tool registry, tool logic, scraper, sanitizer, or `lib/stream.js` internals.
- No change to the public API shape or SSE event contract.
- No RAG/vector store, no cross-instance caching.
- No removal of the LLM fallback entirely — deterministic matching is deliberately strict to avoid hijacking.

## Decisions

### D1. Default "upcoming" window for bare schedule queries (`lib/schedule-answers.js`)

`detectScheduleIntent` currently returns `null` when a schedule keyword matches but no center/time cue is present (lib/schedule-answers.js:182). Change: when a schedule keyword **and a course-noun cue** match, accept the intent with `window = null`. The existing `inWindow` fallback (`start_date >= today`, sorted, capped at 8) already renders the correct "upcoming" list — no new window math.

The **course-noun cue** (`khoa`, `course`, `thien`, `meditation`, `lich`, `schedule`, `vipassana`) is the key guard: `SCHEDULE_KEYWORDS` contains bare intent words like `dang ky`/`register`, and without the guard a question like "Làm sao đăng ký?" would be hijacked into a course list instead of falling through to the registration guidance. Registration words alone → no default window → `null` → normal routing.

*Alternative considered:* defaulting whenever any schedule keyword matches. Rejected — hijacks "how to register" (KB) and center-info-only queries.

### D2. Expanded schedule keywords (`lib/schedule-answers.js`)

Add listing/showing cues to `SCHEDULE_KEYWORDS`: `sắp tới`/`sap toi`, `list`, `liệt kê`/`liet ke`, `danh sách`/`danh sach`, `show`, `có khóa nào`/`co khoa nao`, `which courses`, `xem lịch`/`xem lich`. These combine with D1's default window so "cho tôi xem lịch khóa thiền" and "which courses are upcoming" become deterministic.

### D3. KB FAQ answers + broader definition triggers (`lib/quick-answers.js`)

Widen the curated-definition trigger list (e.g. `vipassana là`, `giới thiệu về vipassana`, `tell me about vipassana`, `vipassana meditation is`) and add deterministic answers for the highest-frequency FAQs where SKILL.md has canonical wording: cost/donation (`miễn phí`/`free`, `cúng dường`/`dana`), diet (`ăn chay`/`vegetarian`), and eligibility (`ai có thể tham gia`/`who can attend`/`điều kiện`). These embed a small amount of SKILL.md prose in code — accepted trade-off for <100ms answers; the strings stay in sync with SKILL.md manually (same convention as the existing curated definition).

### D4. Single model for everything (`api/chat.js`, `lib/router.js`)

Introduce one model id: `MODEL = process.env.AGENT_MODEL || process.env.FAST_MODEL || "mimo-v2.5-free"`, used for `classifyIntent`, the KB fast path, the tool loop, and all retries. `FAST_MODEL` remains a fallback override name; `AGENT_MODEL` wins if set. The classifier's `modelId` parameter (lib/router.js:174) now receives this model.

Rationale: the classifier and tool loop were the only consumers of the slower default; with deterministic coverage expanded, the LLM is a fallback that should be as fast as possible. A single variable removes the "which model am I using" ambiguity and the two-tier failure-fallback dance.

### D5. First-token watchdog on streamed calls (`api/chat.js`)

`streamChatCompletion` currently aborts only via the 50s `LLM_TIMEOUT_MS` timer (api/chat.js:684). Add an optional `firstTokenTimeoutMs` (default ~10s): a second timer that aborts if no content/tool-call delta has arrived before the first one; the 50s timer stays as the overall bound and is cleared/re-armed once streaming starts. On the fast path, a first-token abort is treated like a timeout (`isTimeoutError`), so the existing "retry before first delta" logic fires or the static `error` is emitted — converting a 50s silent hang into a ≤10s failover.

*Alternative considered:* pre-warming / keep-alive pings. Rejected — the watchdog is a single timer and covers the actual observed failure (model never produces a token).

### D6. Keep deterministic gating conservative

All deterministic matchers stay substring/strict: they must never fire on a question that truly needs the LLM. Any match widening is paired with a negative guard (D1's course-noun cue; D3's keyword scoping). A false-negative (LLM fallback) only costs latency; a false-positive could hijack intent — so bias stays conservative.

## Risks / Trade-offs

- **[Default-upcoming window hijacks a course question the LLM would phrase better]** → Guard: course-noun cue required; answer still comes from real scraped/cached data (never fabricated), so correctness is preserved; fallback still available.
- **[FAQ answers in code drift from SKILL.md]** → Same convention as the existing curated Vipassana definition; a comment points at SKILL.md; review on SKILL.md edits.
- **[Single model is less capable than the old tool-loop default]** → With deterministic expansion, the LLM handles the residual; `AGENT_MODEL` env override remains for anyone who wants a stronger tool-loop model.
- **[First-token watchdog false-fires on a slow-but-working model]** → 10s is generous for content to start; on a false abort the fast-path retry still runs once before `error`, so the user is never left with no answer unless the provider is genuinely stuck.
- **[Router/quick-answer keyword bloat slows matching]** → Tables stay small (dozens of entries); matching is a linear substring scan over a few hundred chars — negligible.

## Migration Plan

1. Implement `lib/schedule-answers.js` (D1, D2) + `lib/quick-answers.js` (D3) with tests.
2. Implement single-model + watchdog in `api/chat.js` and `lib/router.js` (D4, D5); extend `tests/stream.test.mjs`.
3. `npm test`; manual smoke of both paths (JSON + SSE).
4. Update `README.md` + `AGENTS.md` (single-model env, default-upcoming path).
5. Sync delta specs; archive.

Rollback: revert the four touched source modules; the changes are additive and locally scoped, no data migration.

## Open Questions

None blocking.
