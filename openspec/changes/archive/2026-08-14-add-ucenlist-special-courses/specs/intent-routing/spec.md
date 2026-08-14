## MODIFIED Requirements

### Requirement: Knowledge-only vs live-data classification
The system SHALL classify each user request as either knowledge-only (answerable from the static knowledge base) or requiring live course data, before choosing a response path. Classification SHALL support both English and Vietnamese. Mentions of special UCENLIST centers such as `pala` / "Dhamma Pala" / "Bodh Gaya" SHALL be treated as ambiguous surface forms that resolve to the live-data path (via the LLM classifier or the deterministic schedule matcher).

#### Scenario: English knowledge-only question routes to fast path
- **WHEN** the user asks "What is Vipassana?"
- **THEN** the system classifies the request as knowledge-only and serves it without invoking any live-data tool.

#### Scenario: Vietnamese knowledge-only question routes to fast path
- **WHEN** the user asks "Nội quy giới luật của khóa thiền 10 ngày là gì?"
- **THEN** the system classifies the request as knowledge-only and serves it from the knowledge base without live-data tools.

#### Scenario: Live-schedule question routes to tool path
- **WHEN** the user asks "Lịch các khóa thiền sắp tới ở Hà Nội?"
- **THEN** the system classifies the request as requiring live course data and invokes the course listing tool.

#### Scenario: Ambiguous question falls back to the LLM classifier
- **WHEN** keyword signals are ambiguous (e.g. a bare "khóa thiền" or "course" with no schedule/registration intent)
- **THEN** the system consults the LLM classifier and routes to the tool path when the classifier is uncertain or fails.

#### Scenario: Special-center mention routes to the live-data path
- **WHEN** the user asks "khóa thiền tại Dhamma Pala" or "course at Dhamma Pala in India"
- **THEN** the system routes the request to the live-data path and the deterministic schedule matcher answers it without an LLM call.