## ADDED Requirements

### Requirement: Bounded time-to-first-token
Streamed LLM calls SHALL abort if no content or tool-call delta arrives within a short first-token deadline (well under the overall request timeout), so a stalled provider surfaces as a fast `error` (or fast-path retry) instead of a long silent wait. The overall request timeout SHALL remain the upper bound on the whole stream.

#### Scenario: Stalled model produces no first token
- **WHEN** a streamed LLM call receives no content or tool-call delta within the first-token deadline
- **THEN** the call aborts and the stream emits the static bilingual `error` event (or, on the fast path before any output, retries once) rather than waiting out the full request timeout

#### Scenario: Healthy stream is unaffected
- **WHEN** a streamed LLM call begins producing deltas within the first-token deadline
- **THEN** the call continues streaming normally and the overall request timeout still bounds the whole stream
