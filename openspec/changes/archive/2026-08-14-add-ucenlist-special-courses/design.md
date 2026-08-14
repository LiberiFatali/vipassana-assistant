## Context

The chatbot discovers course data only from `schedule.vridhamma.org` for the two Vietnamese VRI centers (`virocana`, `vutthi`), scraped live → cached → fallback JSON. UCENLIST additionally publishes special one-off course announcements on its Odoo course-schedule page (`ucenlist.org/course-schedule`, `/en/course-schedule`) — currently "Khoá thiền tại Dhamma Pala 2026" with a `khaosat.me` registration link. These announcements carry a title and an external registration link but no dates. The trusted-domain gate (`TRUSTED_DOMAINS` + system-prompt SECURITY RULES) only allows `ucenlist.org` / `*.vridhamma.org`, so the announcement's registration link would currently be stripped.

## Goals / Non-Goals

**Goals:**
- Surface UCENLIST special course announcements in the deterministic schedule path and in the live-context composer.
- Answer targeted queries ("khóa thiền Dhamma Pala", "course at Dhamma Pala", "Ấn Độ / India") deterministically with zero LLM calls.
- Show dateless announcements in the default "upcoming courses" answer (rendered with title + registration link, not a date range).
- Extend the safe-domain gate to `khaosat.me` while preserving the prompt+code dual enforcement and spoof protection.

**Non-Goals:**
- Inventing dates for dateless announcements, or including them in dated time-window queries.
- Editing `SKILL.md` static content — the live scrape is the source of truth for announcements.
- Supporting registration automation (human-in-the-loop handoff stays unchanged).
- Scraping the two center boxes (already covered by the VRI scraper).

## Decisions

### D1. Scrape the Odoo page with generic announcement-section extraction
New `lib/scraper/ucenlist-schedule.js` fetches the page and iterates `section` elements, qualifying a section as an announcement when it has a heading (`h1/h2/h3`) AND an external `a[href^="http"]` whose host is not `vridhamma.org`/`ucenlist.org` AND whose text matches a course pattern (`kho[áa] thi[ềe]n|course`). This picks up `section.pala-2026` while excluding the center boxes (they only link to `vridhamma.org`) and the page-title section (no link). Returns `{ center_id, title, apply_url }`; `[]` when no section matches; `ScraperError` on network failure so the cache/fallback chain applies.
- *Alternatives considered*: hardcoding the `pala-2026` class selector — rejected because it breaks on markup/class drift and misses future announcements.

### D2. `pala` as a first-class pseudo-center
`pala` (Dhamma Pala, Bodh Gaya, India) joins `CENTERS` with schedule URLs pointing at the UCENLIST page, plus center cues (`dhamma pala`, `pala`, `bodh gaya`, `bodhgaya`, `ấn độ`/`an do`, `india`). Center-info rendering tolerates empty address/phone/email fields for `pala`.
- *Alternatives considered*: a separate "announcements" concept outside the center model — rejected because the existing router/schedule/quick-answer machinery keys everything on `center_id`.

### D3. Dateless announcements in upcoming-only, excluded from date windows
`formatScheduleAnswer`: a course with no parseable `start_date` is included in the no-window "upcoming" filter (and targeted `pala` queries) but excluded from dated time-window queries. Rendering uses the announcement `title` instead of a date range.
- *Alternatives considered*: treating missing dates as "far future" — rejected; it would pollute dated answers with unverifiable dates.

### D4. Trusted-domain extension to `khaosat.me` (explicitly approved)
Both enforcement layers are updated: `TRUSTED_DOMAINS` regex accepts `khaosat\.me`, and the system-prompt SECURITY RULES approved-list adds it as UCENLIST's official registration form for special courses. The regex stays suffix-scoped so spoofs like `khaosat.me.evil.com` remain stripped.
- *Alternatives considered*: keeping khaosat.me untrusted and pointing users at the UCENLIST page — rejected by explicit user approval (the registration link is the primary value of the announcement).

### D5. Fallback JSON entry for `pala`
`lib/fallback-schedule.json` gains a pala entry (empty dates, status open, khaosat apply URL) so the static-fallback layer works when the Odoo scrape fails.

### D6. Announcements flow to the composer via existing context
No SKILL.md edit; `list_courses({ center: "all" })` includes pala, so `buildLiveScheduleContext` carries announcements into the pure-composer system prompt (formatted with title when dateless).

## Risks / Trade-offs

- [Risk] Odoo markup/structure changes break extraction → *Mitigation*: generic section-based extraction, graceful `[]` on no match, and the existing live → cached → fallback chain.
- [Risk] Widening the trusted-domain gate reduces URL-stripping coverage → *Mitigation*: explicitly approved; regex remains suffix-scoped so subdomain-spoofing (`khaosat.me.evil.com`) is still stripped; both prompt and code layers updated together; spoof regression test added.
- [Risk] Extra network fetch on every `center="all"` query → *Mitigation*: runs in parallel with the VRI fetches and is cached 10 minutes in-memory.
- [Risk] Center cues for `india`/`ấn độ` over-match → *Mitigation*: gated by `detectCenterInfoIntent` (quick answers) and by schedule keywords (schedule path); targeted Dhamma Pala queries are the intended behavior.

## Migration Plan

Feature branch `feat/ucenlist-special-courses`. Rollback = revert the branch; the two security-layer edits are the only behavior-visible changes and both stay scoped to `khaosat.me`.

## Open Questions

None.