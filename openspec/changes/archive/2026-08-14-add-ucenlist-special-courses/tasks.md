## 1. Security: trusted-domain extension

- [x] 1.1 Extend `TRUSTED_DOMAINS` in `lib/sanitize.js` to also accept `khaosat.me` (suffix-scoped, so `khaosat.me.evil.com` is still rejected).
- [x] 1.2 Add `khaosat.me` to the system-prompt SECURITY RULES approved-list in `lib/system-prompt.js` without altering any existing grep'd phrases (`language="vi"`, "NEVER fill out", "Please click the link", ⚠️, etc.).

## 2. New scraper: ucenlist.org announcements

- [x] 2.1 Create `lib/scraper/ucenlist-schedule.js` with `UCENLIST_SCHEDULE_URLS` (`vi`/`en`), reusing `fetch_html` from `vri-schedule.js`.
- [x] 2.2 Implement pure `parse_special_courses(html)`: extract sections with a heading AND an external non-`vridhamma.org`/`ucenlist.org` `a[href^="http"]` AND course-like text; return `[{ center_id, title, apply_url }]`; `[]` on no match; `ScraperError` on network failure.

## 3. Centers, cues, and routing

- [x] 3.1 Add `pala` (Dhamma Pala, Bodh Gaya, India) to `lib/centers.js` with schedule URLs pointing at the UCENLIST course-schedule pages.
- [x] 3.2 Add pala keywords (`dhamma pala`, `pala`, `bodh gaya`, `bodhgaya`, `ấn độ`/`an do`, `india`) to `CENTER_CUES` in `lib/quick-answers.js`; guard `renderCenterInfo` so empty address/phone/email fields are skipped.
- [x] 3.3 Add `pala`, `bodh gaya`, `bodhgaya` to `AMBIGUOUS` in `lib/router.js`.

## 4. list_courses integration

- [x] 4.1 Add `"pala"` to the `center` enum in `lib/tools/list-courses.js`; fetch via the ucenlist scraper with the live → 10-min cache → 24h stale → static-fallback chain (cache key `pala_<lang>`).
- [x] 4.2 Include pala in `center="all"` queries (parallel with the two VRI fetches).
- [x] 4.3 Enrich pala course objects (center, location from `CENTERS`, `type: "special"`, empty dates, `status: "open"`, `title`, `data_freshness`).
- [x] 4.4 Add a pala entry to `lib/fallback-schedule.json` (empty dates, status open, khaosat apply URL).

## 5. Deterministic rendering

- [x] 5.1 In `lib/schedule-answers.js`, include `pala` in `selectedCenterKeys` for the default/both-center (upcoming) case.
- [x] 5.2 `inWindow`: include dateless courses in the no-window (upcoming) filter; exclude them from dated time-window queries.
- [x] 5.3 Render dateless courses as `- **<title>** — <status> — [Đăng ký](link)` (no date range).
- [x] 5.4 `buildLiveScheduleContext`: format dateless courses with their title instead of a date range.

## 6. Tests and verification

- [x] 6.1 Add `tests/ucenlist-schedule.test.mjs` (Odoo page fixture: pala section extracted, center boxes and title section excluded, `[]` when absent).
- [x] 6.2 Update `tests/sanitize.test.mjs`: khaosat.me URL survives `sanitize_urls`; spoof `khaosat.me.evil.com` still stripped; fallback-JSON smoke assertion allows `pala`.
- [x] 6.3 Update `tests/schedule-answers.test.mjs`: pala fixture appears in the default upcoming answer with title + khaosat link; excluded from windowed queries.
- [x] 6.4 Add pala center-cue coverage to `tests/quick-answers.test.mjs` (and chat-path if needed).
- [x] 6.5 Run `npm test`; confirm `find api -name '*.js'` returns only `api/chat.js`.