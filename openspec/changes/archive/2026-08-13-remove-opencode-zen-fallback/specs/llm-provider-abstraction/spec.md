## REMOVED Requirements

### Requirement: Multi-provider LLM access
**Reason**: OpenCode Zen fallback removed; the system standardizes on Google Gemini as the single provider.
**Migration**: The provider registry (`PROVIDERS`) retains a single `gemini` entry; provider selection and cross-provider fallback logic are removed.

## ADDED Requirements

### Requirement: Provider-based LLM access
The system SHALL route LLM chat-completions through an OpenAI-compatible endpoint served by a provider registered in a provider registry. The registry SHALL contain a single provider by default: Google Gemini (endpoint `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, key `GEMINI_API_KEY`, default model `gemini-3.1-flash-lite-preview`). The system SHALL NOT fall back to a second provider.

#### Scenario: Gemini serves a completion
- **WHEN** a chat-completions request is made and `GEMINI_API_KEY` is set
- **THEN** the request is sent to Google Gemini and its completion is returned

#### Scenario: Gemini failure propagates
- **WHEN** the provider returns an error (HTTP error, network failure, or timeout)
- **THEN** the failure is propagated to the caller, which returns the static bilingual error response

## MODIFIED Requirements

### Requirement: 429 rate-limit backoff
The system SHALL retry a rate-limited (`429`) request with short exponential backoff, while keeping the total attempt time within the caller's timeout budget.

#### Scenario: Rate-limit retry then success
- **WHEN** the provider returns `429` and then a later retry within the budget succeeds
- **THEN** the successful completion is returned

#### Scenario: Rate-limit retries exhausted
- **WHEN** the provider returns `429` on consecutive retries and the budget is exhausted
- **THEN** the failure is propagated to the caller

### Requirement: Bounded attempt budget
The system SHALL cap the total wall-clock time of all attempts (the request plus its backoff retries) at the caller-provided timeout, defaulting to 60 seconds.

#### Scenario: Budget bounds the retries
- **WHEN** the provider consumes most of the timeout budget on failed attempts
- **THEN** no further attempts are made once the budget is exhausted and the failure is propagated

### Requirement: Configurable model id
The system SHALL resolve the model id as `AGENT_MODEL` if set, else the provider's default model.

#### Scenario: AGENT_MODEL override
- **WHEN** `AGENT_MODEL` is set in the environment
- **THEN** that model id is used for the provider

#### Scenario: Default model per provider
- **WHEN** `AGENT_MODEL` is not set
- **THEN** the provider's default model is used (`gemini-3.1-flash-lite-preview` for Gemini)

### Requirement: Missing-keys handling
The system SHALL reject an LLM call with the static bilingual error when no provider API key is configured, and SHALL log a missing-key warning once per cold start.

#### Scenario: Key absent
- **WHEN** `GEMINI_API_KEY` is not set
- **THEN** the request returns the static bilingual error and logs a missing-key warning

#### Scenario: Key present
- **WHEN** `GEMINI_API_KEY` is set
- **THEN** the request proceeds using the Gemini provider