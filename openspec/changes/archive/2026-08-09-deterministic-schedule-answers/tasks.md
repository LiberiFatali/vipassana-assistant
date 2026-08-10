## 1. Vietnamese date parsing fix

- [x] 1.1 Update `parseSingleDate` in `lib/scraper/vri-schedule.js`: widen the four month-token patterns from `([a-z]+)` to `([a-z]+\.?\d{0,2})` so attached-digit Vietnamese months (`Th8`) parse
- [x] 1.2 Add a year-borrow guard in `parseRange`: when the parsed end date is earlier than the start date (cross-year range), advance the end year by one
- [ ] 1.3 Add `tests/vri-schedule.test.mjs` covering `ThN` formats, year-crossing ranges, EN formats unchanged, and a single-date fallback

## 2. Deterministic schedule fast path

- [x] 2.1 Create `lib/schedule-answers.js` with `detectScheduleIntent(text, now)` (pure): language, center cue, time window ("cuối tháng này", "tháng này", "tháng sau", "tuần này/khác", "tháng N", else upcoming), and the schedule-keyword + (center|time) trigger gate
- [x] 2.2 Add `formatScheduleAnswer(query, courses)` (pure): bilingual markdown with type, `dd/mm/yyyy` dates, status, apply links, schedule link, `⚠️` fallback warning, graceful empty state, and the "registration reminder" caveat preface
- [x] 2.3 Add `getScheduleAnswer(text, lang, { listCourses, now })`: wires detect + listCourses + format, try/catch → `null` on any failure

## 3. Wire into api/chat.js

- [x] 3.1 Import `getScheduleAnswer`; on the `tools` route in `generateAgentResponse` (non-streaming), try the deterministic answer first and return it if matched
- [x] 3.2 On the `tools` route in `runStream` (streaming), try the deterministic answer first and `sse.done()` it if matched
- [x] 3.3 Raise `TOOL_RESULT_ECHO_MAX` from 4096 to 8192

## 4. Tests

- [x] 4.1 Add `tests/schedule-answers.test.mjs`: window detection, trigger gating negatives, formatting, empty state, and fallback warning using injected fixture data + fixed `now` (no network)
- [x] 4.2 Ensure `tests/chat-path.test.mjs` still passes (stubbed fetch makes `listCourses` throw → deterministic path returns `null` → tool loop unchanged)
- [x] 4.3 Run the full suite (`npm test`) green

## 5. Docs

- [x] 5.1 Update `AGENTS.md` request-flow notes with the deterministic schedule fast path
- [x] 5.2 `openspec validate` the change and sync delta specs to main specs at archive
