## Why

Live-schedule questions ("Lịch thiền cuối tháng này ở Hà Nội", "Tôi đã đăng ký khóa thiền cuối tháng này. Nhắc lại giúp tôi ngày tham gia") go through the LLM tool loop and are slow (30–60s), error out, or answer from the wrong subset of data. Two compounding bugs cause this: (1) the VRI site's Vietnamese date format `Th7`/`Th8` is never parsed, so courses keep raw text dates, sort non-chronologically, and the 4096-char tool-result echo truncates the relevant courses; (2) the tool loop (up to 5 steps × 50s LLM timeout + scrapes) structurally exceeds Vercel's 60s function budget, so the request dies with a generic error.

## What Changes

- **Fix Vietnamese date parsing** (`lib/scraper/vri-schedule.js`): `parseSingleDate` month-token patterns accept the site's attached-digit form (`Th8` → August) and `parseRange` borrows a year forward when an end date falls before its start (Dec→Jan ranges). Courses get clean ISO `start_date`/`end_date`, chronological sorting in `listCourses`, and the truncation slice no longer hides the relevant courses.
- **Deterministic schedule fast path** (`lib/schedule-answers.js`, new): schedule queries (center + time window + schedule keyword) are answered without an LLM call by calling `listCourses` (live → cache → fallback), filtering to the requested window ("cuối tháng này", "tháng này", "tháng sau", "tuần này/khác", "tháng N", otherwise upcoming), and rendering a bilingual markdown answer with course type, `dd/mm/yyyy` dates, status, apply links, and the `⚠️` fallback warning. Registration-recall phrasing ("nhắc lại ngày tham gia") gets a preface noting the agent does not store personal registrations. Triggering is gated so knowledge questions ("Vipassana là gì?", "Làm sao đăng ký?") are never routed here.
- **Wire into `api/chat.js`** (both non-streaming `generateAgentResponse` and streaming `runStream`): on the `tools` route, try the deterministic schedule answer first; if it matches, return it directly (no tools, no LLM). Otherwise fall through to the existing tool loop. All output still passes through `sanitize_urls()`.
- **Raise `TOOL_RESULT_ECHO_MAX`** from 4096 to 8192 so a full `center="all"` payload is not truncated for the remaining tool-path queries.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `course-discovery`: adds a deterministic schedule-answer requirement — live course listings for windowed schedule queries are answered without an LLM call, with parsed ISO dates and correct chronological ordering.

## Impact

- **Code (modified):** `lib/scraper/vri-schedule.js` (Vietnamese date parsing + year borrow), `api/chat.js` (schedule fast-path wiring + echo cap), `lib/tools/list-courses.js` (benefits from ISO-date sort)
- **Code (new):** `lib/schedule-answers.js`, `tests/vri-schedule.test.mjs`, `tests/schedule-answers.test.mjs`
- **Docs:** `AGENTS.md` (request-flow note for the deterministic schedule path), this change's spec delta synced into `openspec/specs/course-discovery/spec.md`
- **API:** `POST /api/chat` unchanged — schedule questions now answer faster on the same contract (JSON or SSE)
- **Untouched:** `lib/centers.js`, `lib/fallback-schedule.json`, `public/*`, `server.js`
