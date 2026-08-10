# Specification: Intent Routing

## Purpose
The system classifies each user request as either knowledge-only (answerable from the static knowledge base) or requiring live course data, and routes it to the appropriate response path — a low-latency fast path with no tools for knowledge-only requests, or the full tool loop for live-data requests.

## Requirements

### Requirement: Knowledge-only vs live-data classification
The system SHALL classify each user request as either knowledge-only (answerable from the static knowledge base) or requiring live course data, before choosing a response path. Classification SHALL support both English and Vietnamese.

#### Scenario: English knowledge-only question routes to fast path
- **WHEN** the user asks "What is Vipassana?"
- **THEN** the system classifies the request as knowledge-only and serves it without invoking any live-data tool.

#### Scenario: Vietnamese knowledge-only question routes to fast path
- **WHEN** the user asks "Nội quy giới luật của khóa thiền 10 ngày là gì?"
- **THEN** the system classifies the request as knowledge-only and serves it from the knowledge base without live-data tools.

#### Scenario: Live-schedule question routes to tool path
- **WHEN** the user asks "Lịch khai giảng các khóa thiền sắp tới ở Hà Nội?"
- **THEN** the system classifies the request as requiring live course data and invokes the course listing tool.

#### Scenario: Ambiguous question falls back to the LLM classifier
- **WHEN** keyword signals are ambiguous (e.g. a bare "khóa thiền" or "course" with no schedule/registration intent)
- **THEN** the system consults the LLM classifier and routes to the tool path when the classifier is uncertain or fails.

### Requirement: Conservative default on classifier failure
If the LLM classifier is unavailable, times out, or errors, the system SHALL default to the tool path rather than the knowledge-only fast path. The classifier SHALL run on the fast model with a short, bounded timeout so classification latency is minimized.

#### Scenario: Classifier timeout routes to tool path
- **WHEN** the classifier call times out
- **THEN** the system routes the request to the tool path so the full agent flow (full knowledge base + tools) answers it.

#### Scenario: Classifier runs on the fast model
- **WHEN** an ambiguous request is classified by the LLM classifier
- **THEN** the classifier call uses the single fast model with a bounded timeout, so the classification round-trip stays short

### Requirement: Language detection
The system SHALL detect the user's language (Vietnamese or English) from the request and surface it to the knowledge section selector so bilingual content is served in the matching language.

#### Scenario: Vietnamese message detected as Vietnamese
- **WHEN** the user writes in Vietnamese (e.g. "Thiền Vipassana là gì?")
- **THEN** the system selects the Vietnamese knowledge sections.
