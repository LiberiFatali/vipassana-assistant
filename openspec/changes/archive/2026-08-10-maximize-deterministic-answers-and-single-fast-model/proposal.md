## Why

Pre-defined answers respond instantly because they hit the deterministic paths (`lib/quick-answers.js`, `lib/schedule-answers.js`) with no LLM call, but any slight rephrasing misses the strict keyword matchers and falls through to the LLM — where a free flash model can spend tens of seconds on reasoning with no output, ending in a timeout error. The fix is to widen the deterministic no-LLM coverage so common paraphrases skip the LLM entirely, and to collapse the LLM fallback onto a single fast model with a first-token watchdog so it fails over quickly instead of silently hanging.

## What Changes

- **Default "upcoming" window** (`lib/schedule-answers.js`): a schedule query with a course-noun cue ("khóa thiền sắp tới", "upcoming courses", "khi nào có khóa", "xem lịch") but no center/time cue now renders the upcoming course list deterministically (start_date >= today, sorted, capped), instead of falling into the LLM tool loop. Registration-intent words with no course noun ("Làm sao đăng ký?", "how to register") are explicitly excluded so they still route normally.
- **Schedule keyword coverage** (`lib/schedule-answers.js`): add `sắp tới`, `list`/`liệt kê`/`danh sách`/`show`, `có khóa nào`/`which courses`, `xem lịch` to the trigger set.
- **KB paraphrase coverage** (`lib/quick-answers.js`): widen the curated-definition triggers and add deterministic answers for the most common FAQs (free/donation, diet/vegetarian, eligibility/who can attend) sourced from SKILL.md.
- **Single fast model everywhere** (`api/chat.js`, `lib/router.js`): one model id (`AGENT_MODEL` override, defaulting to `FAST_MODEL`'s `mimo-v2.5-free`) is used for the classifier, the fast path, the tool loop, and retries — dropping the slow `deepseek-v4-flash-free` default and the classifier's extra round-trip cost.
- **First-token watchdog** (`api/chat.js`): a ~10s first-delta deadline on streamed LLM calls aborts a stalled model before the 50s overall timeout, so a "long thinking, no response" case becomes a fast `error` (with the fast-path retry still applying before any output).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `fast-kb-answers`: extends the deterministic structured answers to common FAQs and broadens the curated-definition triggers beyond the exact "Vipassana là gì?" phrasing.
- `course-discovery`: extends the deterministic schedule answer to bare schedule queries with no center/time cue (default upcoming window) and broadens the schedule keyword set.
- `intent-routing`: the LLM classifier uses the single fast model for classification, and its language/section plumbing is unchanged in behavior.
- `streaming-responses`: streamed LLM calls bound the time-to-first-token with a watchdog; retry/failure semantics around first-token aborts are clarified.

## Impact

- **Code (modified):** `api/chat.js` (single model var, first-token watchdog, fast-path retry), `lib/router.js` (classifier model param), `lib/schedule-answers.js` (default window + keywords), `lib/quick-answers.js` (FAQ answers + triggers)
- **Code (new):** none (extensions to existing modules); tests added/extended in `tests/schedule-answers.test.mjs`, `tests/quick-answers.test.mjs`, `tests/stream.test.mjs`
- **Docs:** `README.md` + `AGENTS.md` (single-model env note, default-upcoming path), spec deltas synced into `openspec/specs/`
- **API:** `POST /api/chat` unchanged (JSON + SSE) — more paraphrases now short-circuit to instant deterministic answers
- **Untouched:** `lib/stream.js` (the single sanitization point), `lib/sanitize.js`, `lib/tools/*`, `lib/scraper/*`, `public/*`, `server.js`
