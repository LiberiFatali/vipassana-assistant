## ADDED Requirements

### Requirement: Out-of-scope questions answered deterministically
The system SHALL detect clearly out-of-scope factual questions — topics not covered by the static knowledge base and not about live course schedules, specifically meditation groups/clubs/communities — using deterministic bilingual keyword patterns (diacritic-insensitive), and SHALL answer them with a static "I don't have this information — contact the UCENLIST meditation center / admin team" message without invoking the LLM or any tool.

#### Scenario: Vietnamese meditation-group question
- **WHEN** the user asks "Cho tôi hỏi nhóm thiền ở Hà Nội?"
- **THEN** the system responds that it does not have that information and directs the user to contact the UCENLIST meditation center / admin team, with no LLM call.

#### Scenario: English meditation-group question
- **WHEN** the user asks "Is there a meditation group in Hanoi?"
- **THEN** the system responds in English with the out-of-scope fallback message and makes no LLM call.

#### Scenario: Related community variant
- **WHEN** the user asks about a meditation club, group meditation, or a meditation community (e.g. "câu lạc bộ thiền", "meditation club")
- **THEN** the system answers with the out-of-scope fallback message.

#### Scenario: In-scope question is not flagged
- **WHEN** the user asks a question covered by the knowledge base (e.g. "What is Vipassana?", "Địa chỉ trung tâm thiền Hà Nội?") or about course schedules (e.g. "Lịch khóa thiền tháng sau?")
- **THEN** the system processes it through the normal KB fast path or tool path and does NOT return the out-of-scope fallback.

#### Scenario: Group-registration phrasing is not flagged
- **WHEN** the user asks about registering as a group (e.g. "đăng ký theo nhóm")
- **THEN** the system does NOT treat it as out of scope and routes it normally.

### Requirement: Out-of-scope gate applies to both response paths
The out-of-scope fallback SHALL be applied at the start of both the non-streaming response path and the streaming response path, before intent routing, so it overrides both the KB fast path and the tool path.

#### Scenario: Non-streaming request returns fallback
- **WHEN** the client sends a non-streaming request whose latest user message matches an out-of-scope pattern
- **THEN** the response is the static fallback message with no LLM call and no tool execution.

#### Scenario: Streaming request returns fallback
- **WHEN** the client sends a streaming request whose latest user message matches an out-of-scope pattern
- **THEN** the stream emits a `done` event carrying the static fallback message, with no `delta`, `status`, or LLM calls.

#### Scenario: Fallback output is sanitized
- **WHEN** the out-of-scope fallback message is returned on any path
- **THEN** the message passes through `sanitize_urls()` before reaching the user.

### Requirement: Out-of-scope contact guidance
The out-of-scope fallback message SHALL direct the user to contact the UCENLIST meditation center and the admin team, referencing the general contact email `info@ucenlist.org`, and SHALL be returned in the language of the user's message.

#### Scenario: Vietnamese fallback mentions the email
- **WHEN** the user message is in Vietnamese and matches an out-of-scope pattern
- **THEN** the fallback message is in Vietnamese and tells the user to contact the UCENLIST meditation center / admin team at `info@ucenlist.org`.

#### Scenario: English fallback mentions the email
- **WHEN** the user message is in English and matches an out-of-scope pattern
- **THEN** the fallback message is in English and references `info@ucenlist.org`.

### Requirement: Chitchat keeps current behavior
The out-of-scope fallback SHALL NOT apply to chitchat or identity questions (e.g. "Tell me about yourself", "bạn khỏe không", "who are you"); those continue to be handled by the current KB fast path LLM behavior.

#### Scenario: Identity question not flagged
- **WHEN** the user asks "Tell me about yourself"
- **THEN** the system processes it through the normal KB fast path rather than returning the out-of-scope fallback.

#### Scenario: Greeting not flagged
- **WHEN** the user asks "bạn khỏe không?"
- **THEN** the system processes it through the normal KB fast path rather than returning the out-of-scope fallback.

### Requirement: System prompt hardens out-of-scope behavior
The system prompt SHALL instruct the model to never promise to find or search for information it cannot access, and to answer that it does not have the information and direct the user to the meditation center / admin team for anything not covered by the knowledge base and not related to course schedules.

#### Scenario: Prompt contains the out-of-scope instruction
- **WHEN** the `KNOWLEDGE_SYSTEM_PROMPT` is inspected
- **THEN** it contains an explicit instruction to say it does not have the information and to direct the user to contact the meditation center / admin team instead of promising to look it up.
