## REMOVED Requirements

### Requirement: OpenCode Zen LLM Access
**Reason**: OpenCode Zen fallback removed; the chatbot uses Google Gemini as its sole LLM provider.
**Migration**: Replace with Gemini-only LLM Access requirement (see ADDED).

## ADDED Requirements

### Requirement: Gemini LLM Access
The chatbot SHALL obtain LLM completions through Google Gemini's OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`) authenticated by the `GEMINI_API_KEY` environment variable, using the free `gemini-3.1-flash-lite-preview` model by default. `GEMINI_API_KEY` SHALL be configured. No secondary provider or fallback key is required.

#### Scenario: Chat request routes through Gemini
- **WHEN** a user sends a message to the chatbot and `GEMINI_API_KEY` is set
- **THEN** the agent sends the request to Google Gemini's OpenAI-compatible endpoint with the configured model and returns the completion

#### Scenario: Model is configurable
- **WHEN** `AGENT_MODEL` is set in the environment
- **THEN** the agent uses that model id; when unset it defaults to `gemini-3.1-flash-lite-preview`

## MODIFIED Requirements

### Requirement: Runtime Environment Configuration
The project SHALL define its runtime configuration (function duration, region) in `vercel.json` so behavior is reproducible across local `vercel dev` and production.

#### Scenario: Functions run in a region near Vietnam
- **WHEN** the project is deployed
- **THEN** `api/chat.js` runs in the `sin1` (Singapore) region and has a bounded `maxDuration`