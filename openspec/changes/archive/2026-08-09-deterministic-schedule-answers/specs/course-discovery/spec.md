## ADDED Requirements

### Requirement: Deterministic schedule answers
The system SHALL answer windowed schedule queries (a schedule/course keyword together with a center and/or a time window such as "cuối tháng này", "tháng này", "tháng sau", "tuần này/khác", or a specific month) directly from scraped/cached course data without an LLM call. The answer SHALL be produced in the user's detected language, list only courses falling in the requested window ordered by start date, and include each course's type, start/end dates, registration status, and apply link. The request SHALL fall through to the normal tool loop when the query does not match the deterministic intent. This path SHALL NOT attach tools and its output SHALL pass through `sanitize_urls()`.

#### Scenario: End-of-month schedule in Vietnamese
- **WHEN** the user asks "Lịch thiền cuối tháng này ở Hà Nội" and current date is in the second half of a month
- **THEN** the system returns courses at Dhamma Virocana starting within the final ~14 days of the current month, with parsed dates, in Vietnamese, without an LLM call

#### Scenario: Registration-date reminder is answered with a caveat
- **WHEN** the user asks "Tôi đã đăng ký khóa thiền cuối tháng này. Nhắc lại giúp tôi ngày tham gia"
- **THEN** the system returns the windowed courses with a preface noting it does not store personal registrations, so the user can identify their course dates

#### Scenario: Upcoming courses when no time window is named
- **WHEN** the user asks for a course schedule without a time window and no center
- **THEN** the system returns upcoming courses across both centers, capped to a bounded list, ordered by start date

#### Scenario: Deterministic schedule query is not matched
- **WHEN** a query routes to the tools path but does not match the deterministic schedule intent
- **THEN** the system runs the normal LLM tool loop

#### Scenario: Knowledge questions never trigger the schedule answer
- **WHEN** the user asks "Vipassana là gì?" or "Làm sao đăng ký khóa thiền?"
- **THEN** the query is not treated as a deterministic schedule request and takes the existing knowledge/tool routing

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
