## ADDED Requirements

### Requirement: Special UCENLIST course announcements
The system SHALL discover special/one-off course announcements published on the UCENLIST course-schedule page (`ucenlist.org/course-schedule`, a manually edited Odoo page), in addition to the VRI per-center scrape. Such announcements carry a course heading and an external registration link but typically no dates. They SHALL be represented as a pseudo-center (`pala` for Dhamma Pala, Bodh Gaya, India) in course-listing results, including `center="all"` queries, and each record SHALL carry a `data_freshness` field (`"live"` / `"cached"` / `"fallback"`) from the same live → cached → static-fallback chain. Dateless announcements SHALL be shown in targeted queries about that center and in default "upcoming" answers — rendered with their title and registration link rather than a date range — and SHALL be excluded from dated time-window queries. Announcement registration links SHALL pass through `sanitize_urls()` and are gated by the trusted-domain list.

#### Scenario: Targeted Dhamma Pala query answered deterministically
- **WHEN** the user asks "Khóa thiền tại Dhamma Pala sắp tới" or "what courses are there at Dhamma Pala in India"
- **THEN** the system answers deterministically, listing the Dhamma Pala announcement with its title, registration status, and registration link, without an LLM call

#### Scenario: Announcement appears in the default upcoming list
- **WHEN** the user asks "khóa thiền sắp tới" with no center and no time window
- **THEN** the answer lists upcoming dated courses at the two VRI centers plus the dateless special announcement rendered with its title and registration link

#### Scenario: Announcement excluded from dated time-window queries
- **WHEN** the user asks "Lịch thiền cuối tháng này ở Hà Nội"
- **THEN** the dateless announcement is not shown, because it has no date to match the window

#### Scenario: Fallback announcement carries the freshness warning
- **WHEN** the Odoo scrape fails and the announcement is served from the static fallback JSON
- **THEN** the answer surfaces the fallback data warning alongside the announcement