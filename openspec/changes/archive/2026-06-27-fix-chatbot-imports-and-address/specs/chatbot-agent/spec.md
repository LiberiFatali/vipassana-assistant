## ADDED Requirements

### Requirement: Dynamic Knowledge Base Integration
The chatbot system SHALL dynamically load the complete `SKILL.md` content from the `vipassana-ucenlist-knowledge` skill and integrate it into the system's prompt context. This SHALL replace the hardcoded static knowledge base and cover all static information queries (including Vipassana teachings, center addresses, timetable, contact information, etc.) with up-to-date data.

#### Scenario: Answering Meditation Center Address Queries
- **WHEN** the user asks "Where is the Vipassana Hanoi center?" or "Địa chỉ trung tâm thiền Hà Nội ở đâu?"
- **THEN** the system SHALL return the exact address: "Doi 2, thon Minh Tan, xa Minh Tri, huyen Soc Son, Ha Noi" (or the Vietnamese translated version) along with the contact phone number.

#### Scenario: Answering Course Discipline Rules Queries
- **WHEN** the user asks about the 10-day course rules or timetable
- **THEN** the system SHALL return details (e.g. 5 precepts, noble silence, wakeup at 4:00 AM) retrieved from the dynamically loaded `SKILL.md`.

