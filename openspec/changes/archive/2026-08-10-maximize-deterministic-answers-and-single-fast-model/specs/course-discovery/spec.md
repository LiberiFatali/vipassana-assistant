## MODIFIED Requirements

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
