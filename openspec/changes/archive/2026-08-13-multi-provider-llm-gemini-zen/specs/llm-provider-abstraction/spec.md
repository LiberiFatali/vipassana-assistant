# llm-provider-abstraction Specification

## Purpose
Multi-provider OpenAI-compatible LLM access with a primary provider and an automatic fallback, 429-aware retry, and configurable model selection.

## ADDED Requirements

### Requirement: Multi-provider LLM access
The system SHALL route LLM chat-completions through an OpenAI-compatible endpoint served by a configurable primary provider, and SHALL fall back to a second provider when the primary fails. The primary SHALL default to Google Gemini (endpoint `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, key `GEMINI_API_KEY`, default model `gemini-3.1-flash-lite-preview`) and the fallback SHALL default to OpenCode Zen (endpoint `https://opencode.ai/zen/v1/chat/completions`, key `OPENCODE_API_KEY`, default model `deepseek-v4-flash-free`).

#### Scenario: Primary provider serves a completion
- **WHEN** a chat-completions request is made and the primary provider's API key is set
- **THEN** the request is sent to the primary provider and its completion is returned

#### Scenario: Fallback on primary failure
- **WHEN** the primary provider returns an error (non-429 HTTP error, network failure, or timeout) and the fallback provider's API key is set
- **THEN** the request is retried once against the fallback provider

#### Scenario: No fallback configured
- **WHEN** the primary provider fails and the fallback provider's API key is not set
- **THEN** the failure is propagated to the caller with the static bilingual error response

#### Scenario: Provider selection override
- **WHEN** `LLM_PROVIDER` is set to `zen` in the environment
- **THEN** OpenCode Zen is the primary provider and Gemini is the fallback

### Requirement: 429 rate-limit backoff
The system SHALL retry a rate-limited (`429`) request against the same provider with short exponential backoff before falling back, while keeping the total attempt time within the caller's timeout budget.

#### Scenario: Rate-limit retry then success
- **WHEN** the primary provider returns `429` and then a later retry within the budget succeeds
- **THEN** the successful completion is returned without invoking the fallback

#### Scenario: Rate-limit retries exhausted
- **WHEN** the primary provider returns `429` on consecutive retries and the budget is exhausted
- **THEN** the request fails over to the fallback provider if configured, otherwise the failure is propagated

### Requirement: Bounded attempt budget
The system SHALL cap the total wall-clock time of all attempts (primary, backoff retries, and fallback) at the caller-provided timeout, defaulting to 60 seconds.

#### Scenario: Fallback uses remaining budget
- **WHEN** the primary provider consumes most of the timeout budget
- **THEN** the fallback attempt is only made if time remains within the budget

### Requirement: Configurable model id
The system SHALL resolve the model id for any provider as `AGENT_MODEL` if set, else `FAST_MODEL` if set, else the provider's default model.

#### Scenario: AGENT_MODEL override
- **WHEN** `AGENT_MODEL` is set in the environment
- **THEN** that model id is used for whichever provider is active

#### Scenario: Default model per provider
- **WHEN** neither `AGENT_MODEL` nor `FAST_MODEL` is set
- **THEN** the active provider's default model is used (`gemini-3.1-flash-lite-preview` for Gemini, `deepseek-v4-flash-free` for OpenCode Zen)

### Requirement: Missing-keys handling
The system SHALL reject an LLM call with the static bilingual error when no provider API key is configured, and SHALL log a missing-key warning once per cold start.

#### Scenario: Both keys absent
- **WHEN** neither `GEMINI_API_KEY` nor `OPENCODE_API_KEY` is set
- **THEN** the request returns the static bilingual error and logs a missing-key warning

#### Scenario: At least one key present
- **WHEN** at least one provider key is set
- **THEN** the request proceeds using that provider