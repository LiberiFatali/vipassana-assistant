## MODIFIED Requirements

### Requirement: Conservative default on classifier failure
If the LLM classifier is unavailable, times out, or errors, the system SHALL default to the tool path rather than the knowledge-only fast path. The classifier SHALL run on the fast model with a short, bounded timeout so classification latency is minimized.

#### Scenario: Classifier timeout routes to tool path
- **WHEN** the classifier call times out
- **THEN** the system routes the request to the tool path so the full agent flow (full knowledge base + tools) answers it.

#### Scenario: Classifier runs on the fast model
- **WHEN** an ambiguous request is classified by the LLM classifier
- **THEN** the classifier call uses the single fast model with a bounded timeout, so the classification round-trip stays short
