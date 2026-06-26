# Specification: Course Discovery

The Course Discovery capability enables live retrieval of upcoming Vipassana courses and center details from the UCENLIST organization websites.

## Requirements

### Requirement: Live Course Listing
The system SHALL scrape and list courses from schedule.vridhamma.org with caching and a JSON fallback strategy.

#### Scenario: Retrieve courses from the scraper
- **WHEN** user requests a list of courses for a center
- **THEN** system returns the parsed course details (start/end date, type, status, apply URL).
