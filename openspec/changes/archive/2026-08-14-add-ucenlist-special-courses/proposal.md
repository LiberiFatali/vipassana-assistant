## Why

UCENLIST's course-schedule page (`ucenlist.org/course-schedule`, a manually edited Odoo page) sometimes lists special courses beyond the two VRI centers — e.g. "Khoá thiền tại Dhamma Pala 2026" with a registration link on `khaosat.me`. The bot only scrapes `schedule.vridhamma.org` for `virocana`/`vutthi`, so these announcements are invisible to it, and the registration link would be stripped by the trusted-domain gate (`sanitize_urls()` allows only `ucenlist.org` / `*.vridhamma.org`).

## What Changes

- New scraper `lib/scraper/ucenlist-schedule.js` that fetches the Odoo course-schedule page and extracts generic special-announcement sections (a course heading plus an external registration link), so future announcements are picked up automatically.
- A third pseudo-center `pala` (Dhamma Pala, Bodh Gaya, India) wired through `lib/centers.js`, center cues, `list_courses`, the deterministic schedule path, and the static fallback JSON.
- Special courses (which have no dates) render as announcements with their title and registration link in targeted queries and in the default "upcoming courses" list; they are excluded from dated time-window queries.
- Safe-domain gate extended to `khaosat.me` (UCENLIST's official registration form for special courses) in both enforcement layers — `lib/sanitize.js` `TRUSTED_DOMAINS` and the system-prompt SECURITY RULES — keeping the prompt+code dual-layer intact.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `course-discovery`: adds the UCENLIST announcement source to course listing and deterministic schedule answers (new pseudo-center `pala`, dateless announcement rendering).
- `chatbot-agent`: Safe Domain Gating requirement is extended so `khaosat.me` URLs are trusted in both the system prompt and `sanitize_urls()`.
- `intent-routing`: ambiguous cue table gains `pala` / `Dhamma Pala` / `Bodh Gaya` so bare mentions resolve to the live-data path.

## Impact

- `lib/scraper/ucenlist-schedule.js` (new): Odoo page scraper for special-announcement sections.
- `lib/centers.js`: adds `pala` static center entry.
- `lib/tools/list-courses.js`: adds `pala` to the center enum and the `center="all"` flow, with live → cache → fallback chain.
- `lib/schedule-answers.js`: dateless announcement rendering; pala included in default upcoming lists.
- `lib/quick-answers.js`: `CENTER_CUES` gains pala keywords; center-info renderer tolerates empty fields.
- `lib/router.js`: `AMBIGUOUS` table gains pala mentions.
- `lib/sanitize.js` + `lib/system-prompt.js`: trusted-domain extension to `khaosat.me`.
- `lib/fallback-schedule.json`: pala fallback entry.
- `tests/*`: new `ucenlist-schedule` suite; updates to sanitize, schedule-answers, quick-answers, chat-path.
