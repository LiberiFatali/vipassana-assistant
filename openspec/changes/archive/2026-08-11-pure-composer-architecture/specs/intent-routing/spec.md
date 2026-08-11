## MODIFIED Requirements

### Requirement: Knowledge-only vs live-data classification
The system SHALL classify each user request as either knowledge-only (answerable from static knowledge base) or requiring live course data, before choosing a response path. Classification SHALL support both English and Vietnamese. All paths SHALL execute as single-turn completions/streams with `tools: false` without function tool calling.

#### Scenario: English knowledge-only question routes to fast path
- **WHEN** the user asks "What is Vipassana?"
- **THEN** the system classifies the request as knowledge-only and serves it without invoking any live-data tool or function call.

#### Scenario: Vietnamese knowledge-only question routes to fast path
- **WHEN** the user asks "Nội quy giới luật của khóa thiền 10 ngày là gì?"
- **THEN** the system classifies the request as knowledge-only and serves it from the knowledge base without live-data tools or function calls.

#### Scenario: Live-schedule question routes to single-turn composer path
- **WHEN** the user asks "Lịch các khóa thiền sắp tới ở Hà Nội?"
- **THEN** the system pre-fetches live course data in Node.js and composes the answer in a single-turn stream without function tool calling.
