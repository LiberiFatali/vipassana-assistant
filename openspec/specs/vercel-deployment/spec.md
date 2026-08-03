# vercel-deployment Specification

## Purpose
TBD - created by archiving change deploy-on-vercel. Update Purpose after archive.
## Requirements
### Requirement: Vercel Project Deployment
The chatbot SHALL be deployed as a Vercel project consisting of Node.js serverless functions under `api/` and a static frontend under `public/`, with no build step.

#### Scenario: Deploy via Vercel CLI
- **WHEN** a contributor runs `vercel deploy --prod` with the project linked and environment variables configured
- **THEN** Vercel builds and serves the `public/` static frontend and exposes `api/*` functions at their `/api/*` routes.

#### Scenario: Deploy via GitHub import
- **WHEN** the repository is imported into a Vercel project
- **THEN** every push to the production branch deploys the app with the same structure and environment variables.

### Requirement: OpenCode Zen LLM Access
The chatbot SHALL obtain LLM completions through OpenCode Zen (OpenAI-compatible endpoint at `https://opencode.ai/zen/v1`) authenticated by the `OPENCODE_API_KEY` environment variable, using a free model by default (`deepseek-v4-flash-free`), and SHALL NOT require a provider API key (e.g. Gemini).

#### Scenario: Chat request routes through OpenCode Zen
- **WHEN** a user sends a message to the chatbot and `OPENCODE_API_KEY` is set
- **THEN** the agent sends the request to OpenCode Zen with the configured model and returns the completion.

#### Scenario: Model is configurable
- **WHEN** `AGENT_MODEL` is set in the environment
- **THEN** the agent uses that model id; when unset it defaults to `deepseek-v4-flash-free`.

### Requirement: Stateless Chat API Endpoint
The system SHALL expose a single stateless `POST /api/chat` endpoint that accepts the full message history from the client, applies the agent (system prompt + knowledge base + tools), and returns the sanitized response text.

#### Scenario: User message returns agent response
- **WHEN** a client POSTs `{ "messages": [{ "role": "user", "content": "..." }] }` to `/api/chat`
- **THEN** the endpoint returns `{ "text": "<sanitized response>" }` without requiring server-side session state.

#### Scenario: Message history is bounded
- **WHEN** the client sends more than 20 messages
- **THEN** the endpoint trims the history to the most recent 20 messages before invoking the model.

### Requirement: Runtime Environment Configuration
The project SHALL define its runtime configuration (function duration, region) in `vercel.json` so behavior is reproducible across local `vercel dev` and production.

#### Scenario: Functions run in a region near Vietnam
- **WHEN** the project is deployed
- **THEN** `api/chat.js` runs in the `sin1` (Singapore) region and has a bounded `maxDuration`.

