## 1. Deterministic schedule expansion (`lib/schedule-answers.js`)

- [x] 1.1 Add a default "upcoming" window: in `detectScheduleIntent`, when a schedule keyword matches and a course-noun cue is present but no center/time cue exists, accept the intent with `window = null` (the existing `inWindow` fallback renders upcoming courses)
- [x] 1.2 Add the course-noun guard (`khoa`, `course`, `thien`, `meditation`, `lich`, `schedule`, `vipassana`) so registration-intent words alone (e.g. "Làm sao đăng ký?") still return `null` and fall through
- [x] 1.3 Extend `SCHEDULE_KEYWORDS` with listing/showing cues: `sắp tới`/`sap toi`, `list`, `liệt kê`/`liet ke`, `danh sách`/`danh sach`, `show`, `có khóa nào`/`co khoa nao`, `which courses`, `xem lịch`/`xem lich`
- [x] 1.4 Add an `upcoming` label to `windowLabel` ("sắp tới" / "upcoming") for the default-window prefix text
- [x] 1.5 Add tests: default-upcoming fires for "khóa thiền sắp tới", "upcoming courses", "khi nào có khóa", "xem lịch"; still `null` for "Làm sao đăng ký?" and "how to register"

## 2. KB quick-answer expansion (`lib/quick-answers.js`)

- [x] 2.1 Widen the curated-definition triggers: `vipassana là`, `giới thiệu về vipassana`/`gioi thieu`, `tell me about vipassana`, `vipassana meditation is`, `about vipassana`
- [x] 2.2 Add curated bilingual FAQ answers for cost/donation (`miễn phí`/`free`, `cúng dường`/`dana`), diet (`ăn chay`/`vegetarian`), and eligibility (`ai có thể tham gia`/`who can attend`/`điều kiện`/`conditions`), sourced from SKILL.md
- [x] 2.3 Add tests for the new triggers and FAQ answers (Vietnamese + English); keep strict matching so unmatched questions still return `null`

## 3. Single model everywhere (`api/chat.js`, `lib/router.js`)

- [x] 3.1 Introduce one model id in `api/chat.js`: `MODEL = process.env.AGENT_MODEL || process.env.FAST_MODEL || DEFAULT_FAST_MODEL` and use it for the classifier, fast path, tool loop, and retries (replace the `AGENT_MODEL`-default usages at api/chat.js:200, :262, and the fast-path fallbacks)
- [x] 3.2 Pass the single model id into `classifyIntent` so the LLM classifier uses it (lib/router.js:174)
- [x] 3.3 Update README.md + AGENTS.md env documentation to describe the single-model setup (`AGENT_MODEL` override, default `mimo-v2.5-free`)

## 4. First-token watchdog (`api/chat.js`)

- [x] 4.1 Add a `FIRST_TOKEN_TIMEOUT_MS` (≈10s) to `streamChatCompletion`: a single abort timer armed at the first-token bound and re-armed at `LLM_TIMEOUT_MS` once the first content/tool-call delta arrives, so a stalled model fails fast while a mid-stream hang still cannot run forever
- [x] 4.2 Verify fast-path handling treats a first-token abort as `isTimeoutError` so the existing retry-before-first-delta logic fires, else emits the static `error`
- [x] 4.3 Add tests in `tests/stream.test.mjs`: a stalled stream with no first token emits `error` (no `done`, no retry); a healthy streamed call is unaffected

## 5. Verification

- [x] 5.1 `npm test` passes (new + existing suites)
- [x] 5.2 Manual smoke via `npm run dev` + curl: JSON and SSE paths for a knowledge paraphrase, a bare schedule query, and a live course query
