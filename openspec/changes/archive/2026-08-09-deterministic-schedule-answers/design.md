## Context

`POST /api/chat` classifies each request into a knowledge (`kb`) or live-data (`tools`) path. Both example failure cases route to `tools` and run the full LLM tool loop: up to 5 steps, each with a 50s LLM timeout, plus live scrapes of `schedule.vridhamma.org`. This structurally exceeds Vercel's 60s `maxDuration`. On top of that, the VRI site's Vietnamese date format (`Th7`, `Th8`, `Th10` — month token with attached digit) is not parsed by `parseSingleDate`, so courses keep raw text dates (`"20 Th8 - 23 Th8"`), `listCourses` sorts them lexically (October/December before August), and the 4096-char tool-result echo truncates the data the model sees — producing slow, wrong, or erroring answers.

The KB fast path already has a deterministic, no-LLM layer (`lib/quick-answers.js`) for center info; the schedule fast path extends the same idea to live course data.

## Goals / Non-Goals

**Goals:**
- Windowed schedule questions answer in ~4–5s (one cached scrape, no LLM) with correct dates and no error.
- Vietnamese `ThN` dates parse to ISO so sorting and the tool echo are correct.
- Preserve the safety model: `sanitize_urls()` on every path, no tools on the deterministic path, fallback `⚠️` warning surfaced.

**Non-Goals:**
- Not changing the tool loop's retry/timeout architecture for non-schedule queries.
- Not adding persistent per-user registration memory — the "nhắc lại ngày tham gia" case is answered with the windowed schedule plus a caveat, not a stored record.

## Decisions

**Decision 1 — Parse Vietnamese dates by widening the month-token regex, not special-casing.** `parseSingleDate` uses `([a-z]+)` for the month token, which cannot match `Th8` because of the attached digit. Change those four patterns to `([a-z]+\.?\d{0,2})`; `monthNum` already resolves `th7`/`th8` via its `thg?` regex, so no change is needed there. Alternatives considered: a dedicated `Th(\d{1,2})` branch before the generic patterns — rejected as redundant since the generic branch handles all existing formats plus the new one.

**Decision 2 — Year-borrow for cross-year ranges.** `parseRange` defaults missing years to the current year, so `29 Th12 - 2 Th1` would yield end `2026-01-02` < start `2026-12-29`. Add a guard: if `fe < fs`, advance the end year by one and re-format.

**Decision 3 — New `lib/schedule-answers.js` with pure, testable functions.** Split into `detectScheduleIntent(text, now)` (pure: language, center cue, time window, gate), `formatScheduleAnswer(query, courses)` (pure markdown rendering), and `getScheduleAnswer(text, lang, { listCourses, now })` (wires the two, try/catch → `null` on failure). Pure functions + injected `now`/`listCourses` keep tests network-free and deterministic. Center cues are reused from `lib/quick-answers.js`; center links/names come from `lib/centers.js`.

**Decision 4 — Trigger gating to avoid hijacking knowledge questions.** Trigger requires a schedule/course keyword (`lịch`, `khóa thiền`, `khi nào`, `ngày tham gia`, `còn chỗ`, `đăng ký`, …) AND (a center cue OR a time cue). "Vipassana là gì?" has neither, and "Làm sao đăng ký khóa thiền?" has the keyword but no center/time cue — both fall through. Daily-timetable/`lịch sử` questions are already routed to `kb` by the router and never reach this path.

**Decision 5 — Wire in before the tool loop, on both response paths.** In `generateAgentResponse` (non-streaming) and `runStream` (streaming), after routing to `tools`, try `getScheduleAnswer` first and short-circuit on a match (streaming emits `done` with the full sanitized text, mirroring the quick-answer branch). Any failure returns `null` → existing tool loop runs unchanged.

**Decision 6 — Raise `TOOL_RESULT_ECHO_MAX` 4096 → 8192.** A full `center="all"` scrape is ~7KB; 4096 truncated it. Bumping to 8192 keeps the full payload for the remaining tool-path queries without meaningfully growing the prompt.

## Risks / Trade-offs

- [Window semantics are heuristic] → "cuối tháng này" is defined as `start_date ≥ monthStart + 14 days`; a user mid-month asking broadly may get a subset. The answer always links the full schedule page for verification.
- [Fallback data is stale] → existing `data_freshness == "fallback"` courses render with the `⚠️` warning and a link to the live schedule, matching the tool path.
- [Deterministic answer may not match every phrasing] → anything unmatched still falls through to the LLM tool loop, so no query loses the ability to be answered.
- [Deterministic path adds ~4s scrape on cold instances] → `ScheduleCache` (10-min TTL) makes warm requests near-instant; this is still far faster than the current 30–60s.

## Migration Plan

No data or API migration. Deploy as-is; schedule questions silently start answering faster. Rollback: revert the `api/chat.js` wiring and `lib/schedule-answers.js` import — the date-parsing change is safe to keep.

## Open Questions

None.
