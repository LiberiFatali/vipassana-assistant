# vercel-deployment Specification

## Purpose
TBD - created by archiving change deploy-on-vercel. Update Purpose after archive.

## MODIFIED Requirements

### Requirement: OpenCode Zen LLM Access
The chatbot SHALL obtain LLM completions through an OpenAI-compatible endpoint provided by a primary LLM provider that defaults to Google Gemini (endpoint `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`) authenticated by the `GEMINI_API_KEY` environment variable, using the free `gemini-3.1-flash-lite-preview` model by default, and SHALL fall back to OpenCode Zen (endpoint `https://opencode.ai/zen/v1`) authenticated by `OPENCODE_API_KEY` when Gemini fails. At least one provider API key SHALL be configured.

#### Scenario: Chat request routes through Gemini
- **WHEN** a user sends a message to the chatbot and `GEMINI_API_KEY` is set
- **THEN** the agent sends the request to Google Gemini's OpenAI-compatible endpoint with the configured model and returns the completion.

#### Scenario: Gemini fails and Zen fallback is used
- **WHEN** a user sends a message, `GEMINI_API_KEY` is set but Gemini returns an error, and `OPENCODE_API_KEY` is set
- **THEN** the agent sends the request to OpenCode Zen and returns its completion.

#### Scenario: Provider is configurable
- **WHEN** `LLM_PROVIDER` is set to `zen` in the environment
- **THEN** OpenCode Zen is used as the primary provider.

#### Scenario: Model is configurable
- **WHEN** `AGENT_MODEL` is set in the environment
- **THEN** the agent uses that model id; when unset it defaults to the active provider's default model (`gemini-3.1-flash-lite-preview` for Gemini, `deepseek-v4-flash-free` for OpenCode Zen).