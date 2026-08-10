## ADDED Requirements

### Requirement: Bilingual retrieval over the knowledge base
The system SHALL provide a BM25 retrieval engine that indexes every English and Vietnamese section of SKILL.md as knowledge documents plus a curated bilingual corpus of live-data (tools) intent exemplars, and SHALL rank documents for a given query through a single shared pipeline: diacritic stripping, lowercasing, and whitespace tokenization. The index SHALL be built once per process from the section parser.

#### Scenario: Vietnamese query matches the Vietnamese section
- **WHEN** the user asks a Vietnamese question about the Code of Discipline (e.g. "Nội quy giới luật của khóa thiền 10 ngày là gì?")
- **THEN** the retrieval engine ranks the Vietnamese discipline section above unrelated sections

#### Scenario: Diacritic-free Vietnamese query still matches
- **WHEN** the user asks "thoi khoa bieu hang ngay" (typed without diacritics)
- **THEN** the retrieval engine ranks the daily-timetable section because matching is robust to diacritic-free Vietnamese

#### Scenario: Tools exemplar corpus is searchable
- **WHEN** the user asks "khóa thiền sắp tới ở Hà Nội?"
- **THEN** at least one tools-class exemplar appears among the top results alongside the matching knowledge section

### Requirement: Deterministic kb-versus-tools margin classification
The system SHALL classify a query as knowledge-only or live-data by comparing the best knowledge-document score with the best tools-exemplar score under a configurable margin; when neither side wins by the margin the classifier SHALL report the query as ambiguous.

#### Scenario: Clear live-data match is classified as tools
- **WHEN** a query scores far higher against tools exemplars than against any knowledge section
- **THEN** the retrieval classifier reports kind "tools"

#### Scenario: Clear knowledge match is classified as kb
- **WHEN** a query scores far higher against a knowledge section than against tools exemplars
- **THEN** the retrieval classifier reports kind "kb"

#### Scenario: Low-confidence match reports ambiguous
- **WHEN** the best knowledge and tools scores fall within the margin
- **THEN** the retrieval classifier reports kind "ambiguous"

### Requirement: Retrieval-based section selection
The system SHALL select the top knowledge sections for a query by retrieval score, restricted to the user's detected language where a language-specific section exists, and SHALL fall back to a general default set when no section clears a minimum score floor.

#### Scenario: Relevant section selected in the detected language
- **WHEN** the user asks in English "How does the daily timetable work during a course?"
- **THEN** the English daily-timetable section is selected

#### Scenario: Default sections when nothing clears the floor
- **WHEN** a query matches no knowledge section above the score floor
- **THEN** the ABOUT UCENLIST and WHAT IS VIPASSANA sections are selected as defaults
