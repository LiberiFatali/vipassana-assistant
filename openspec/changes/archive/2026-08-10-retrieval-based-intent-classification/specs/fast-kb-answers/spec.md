## ADDED Requirements

### Requirement: Retrieval-based knowledge section selection
The system SHALL select the knowledge sections injected into the fast-path prompt by BM25 retrieval over the full section text rather than a fixed keyword-to-section map, SHALL select sections in the user's detected language when a language-specific section exists, and SHALL fall back to the general default sections (ABOUT UCENLIST and WHAT IS VIPASSANA) when no section clears the score floor.

#### Scenario: English timetable paraphrase selects the English timetable section
- **WHEN** the user asks "How does the daily timetable work during a course?" (a paraphrase whose tokens match the timetable section text)
- **THEN** the fast-path prompt includes the English daily-timetable section

#### Scenario: Vietnamese discipline question selects the Vietnamese section
- **WHEN** the user asks "Nội quy giới luật của khóa thiền 10 ngày là gì?"
- **THEN** the fast-path prompt includes the Vietnamese discipline section

#### Scenario: Unmatched query falls back to the general default
- **WHEN** a query clears no section score floor
- **THEN** the fast-path prompt includes the ABOUT UCENLIST and WHAT IS VIPASSANA sections
