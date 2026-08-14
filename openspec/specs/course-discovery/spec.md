# Specification: Course Discovery

## Purpose
The Course Discovery capability enables live retrieval of upcoming Vipassana courses and center details from the UCENLIST organization websites.

## Requirements

### Requirement: Live Course Listing
The system SHALL scrape and list courses from schedule.vridhamma.org with caching and a JSON fallback strategy.

#### Scenario: Retrieve courses from the scraper
- **WHEN** user requests a list of courses for a center
- **THEN** system returns the parsed course details (start/end date, type, status, apply URL).

### Requirement: Special UCENLIST course announcements
The system SHALL discover special/one-off course announcements published on the UCENLIST course-schedule page (`ucenlist.org/course-schedule`, a manually edited Odoo page), in addition to the VRI per-center scrape. Such announcements carry a course heading but typically no dates. They SHALL be represented as a pseudo-center (`pala` for Dhamma Pala, Bodh Gaya, India) in course-listing results, including `center="all"` queries, and each record SHALL carry a `data_freshness` field (`"live"` / `"cached"` / `"fallback"`) from the same live → cached → static-fallback chain. Dateless announcements SHALL be shown in targeted queries about that center and in default "upcoming" answers — rendered with their title and status rather than a date range, and with no external registration link (external links on the Odoo page are not captured; the only link offered is the official `ucenlist.org/course-schedule` page from the schedule footer). Announcements SHALL be excluded from dated time-window queries. Announcement records SHALL be identified by their `type: "special"` marker rather than by a specific center id, so announcements whose derived center id is not a known `CENTERS` key still render gracefully. All output links SHALL pass through `sanitize_urls()` and are gated by the trusted-domain list.

#### Scenario: Targeted Dhamma Pala query answered deterministically
- **WHEN** the user asks "Khóa thiền tại Dhamma Pala sắp tới" or "what courses are there at Dhamma Pala in India"
- **THEN** the system answers deterministically, listing the Dhamma Pala announcement with its title and registration status and linking to the official UCENLIST course-schedule page, without an LLM call

#### Scenario: Announcement appears in the default upcoming list
- **WHEN** the user asks "khóa thiền sắp tới" with no center and no time window
- **THEN** the answer lists upcoming dated courses at the two VRI centers plus the dateless special announcement rendered with its title and status, with the official UCENLIST schedule link provided in the footer

#### Scenario: Announcement excluded from dated time-window queries
- **WHEN** the user asks "Lịch thiền cuối tháng này ở Hà Nội"
- **THEN** the dateless announcement is not shown, because it has no date to match the window

#### Scenario: Fallback announcement carries the freshness warning
- **WHEN** the Odoo scrape fails and the announcement is served from the static fallback JSON
- **THEN** the answer surfaces the fallback data warning alongside the announcement

### Requirement: Deterministic schedule answers
The system SHALL answer schedule queries directly from scraped/cached course data without an LLM call. This SHALL apply to windowed schedule queries (a schedule/course keyword together with a center and/or a time window such as "cuối tháng này", "tháng này", "tháng sau", "tuần này/khác", or a specific month) AND to bare schedule/listing queries that mention a course noun (e.g. "khóa thiền sắp tới", "upcoming courses", "khi nào có khóa", "xem lịch") with no center and no time window, in which case the system SHALL answer with the upcoming courses (start date on or after today) across the relevant centers, capped to a bounded list ordered by start date. The answer SHALL be produced in the user's detected language, include each course's type, start/end dates, registration status, and apply link, and its output SHALL pass through `sanitize_urls()`. Queries that do not match — including registration-intent phrasing with no course noun (e.g. "Làm sao đăng ký?", "how to register") — SHALL fall through to the normal tool loop. This path SHALL NOT attach tools.

#### Scenario: End-of-month schedule in Vietnamese
- **WHEN** the user asks "Lịch thiền cuối tháng này ở Hà Nội" and current date is in the second half of a month
- **THEN** the system returns courses at Dhamma Virocana starting within the final ~14 days of the current month, with parsed dates, in Vietnamese, without an LLM call

#### Scenario: Registration-date reminder is answered with a caveat
- **WHEN** the user asks "Tôi đã đăng ký khóa thiền cuối tháng này. Nhắc lại giúp tôi ngày tham gia"
- **THEN** the system returns the windowed courses with a preface noting it does not store personal registrations, so the user can identify their course dates

#### Scenario: Upcoming courses when no time window is named
- **WHEN** the user asks for a course schedule with a course noun but without a time window and no center, e.g. "khóa thiền sắp tới" or "which courses are upcoming"
- **THEN** the system returns upcoming courses across both centers, capped to a bounded list, ordered by start date, without an LLM call

#### Scenario: Registration-intent question without a course noun falls through
- **WHEN** the user asks "Làm sao đăng ký khóa thiền?" or "how to register"
- **THEN** the query is not treated as a deterministic schedule request and takes the existing knowledge/tool routing

#### Scenario: Deterministic schedule query is not matched
- **WHEN** a query routes to the tools path but does not match the deterministic schedule intent
- **THEN** the system runs the normal LLM tool loop

#### Scenario: Knowledge questions never trigger the schedule answer
- **WHEN** the user asks "Vipassana là gì?"
- **THEN** the query is not treated as a deterministic schedule request and takes the existing knowledge routing

### Requirement: Parsed Vietnamese course dates
The course scraper SHALL parse the VRI site's Vietnamese date format (e.g. `20 Th8 - 23 Th8` for 20–23 August) into ISO `YYYY-MM-DD` start/end dates, so listings sort chronologically and the LLM/tool echo never carries raw unparsed date strings. Ranges that cross a year boundary (e.g. `29 Th12 - 2 Th1`) SHALL have the end year advanced.

#### Scenario: Vietnamese month token with attached digit
- **WHEN** the scraper parses a date cell "20 Th8 - 23 Th8"
- **THEN** the course has `start_date` "2026-08-20" and `end_date` "2026-08-23"

#### Scenario: Year-crossing range
- **WHEN** the scraper parses a date cell "29 Th12 - 2 Th1"
- **THEN** the course has `start_date` "2026-12-29" and `end_date` "2027-01-02"

#### Scenario: Existing English date formats still parse
- **WHEN** the scraper parses an English date cell "01 Aug - 12 Aug 2026"
- **THEN** the course has `start_date` "2026-08-01" and `end_date` "2026-08-12"
