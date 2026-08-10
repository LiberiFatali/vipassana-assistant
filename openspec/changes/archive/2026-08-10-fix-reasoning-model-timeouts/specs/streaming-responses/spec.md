# Delta Spec: Streaming Responses

## MODIFIED Requirements

### Requirement: Bounded time-to-first-token
Streamed LLM calls SHALL abort if no delta of any kind — content, tool-call, or reasoning (`reasoning`/`reasoning_content`) — arrives within a short first-token deadline (well under the overall request timeout), so a stalled provider surfaces as a fast `error` (or fast-path retry) instead of a long silent wait. A reasoning delta SHALL count as proof the stream is alive, re-arming the first-token deadline to the overall request timeout, so a model that streams thinking before content is not falsely aborted. The overall request timeout SHALL remain the upper bound on the whole stream.

#### Scenario: Stalled model produces no first token
- **WHEN** a streamed LLM call receives no delta (content, tool-call, or reasoning) within the first-token deadline
- **THEN** the call aborts and the stream emits the static bilingual `error` event (or, on the fast path before any output, retries once) rather than waiting out the full request timeout

#### Scenario: Reasoning before content is not a stall
- **WHEN** a streamed LLM call emits `reasoning`/`reasoning_content` deltas before any content or tool-call delta, still within the first-token deadline
- **THEN** the first-token deadline is re-armed to the overall request timeout and the call continues streaming normally until content (or a real hang) follows

#### Scenario: Healthy stream is unaffected
- **WHEN** a streamed LLM call begins producing deltas within the first-token deadline
- **THEN** the call continues streaming normally and the overall request timeout still bounds the whole stream
