## ADDED Requirements

### Requirement: Deterministic retrieval resolution before the LLM classifier
When local keyword signals are ambiguous, the system SHALL first attempt to resolve the request with the retrieval classifier; the LLM classifier SHALL only be consulted when retrieval cannot decide within its margin. On retrieval or LLM failure or timeout the system SHALL default to the tool path, preserving the conservative bias.

#### Scenario: Ambiguous schedule paraphrase resolves to tools without an LLM call
- **WHEN** the user asks a live-data paraphrase that is ambiguous by local keywords but scores clearly against tools exemplars (e.g. "Những khóa nào sắp diễn ra trong thời gian tới?")
- **THEN** the request routes to the tool path without consulting the LLM classifier

#### Scenario: Below-margin query still consults the LLM classifier
- **WHEN** a bare "khóa thiền" or "course" query stays within the retrieval margin
- **THEN** the system consults the LLM classifier and routes to the tool path when the classifier is uncertain or fails
