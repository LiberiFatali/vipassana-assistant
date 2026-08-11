## ADDED Requirements

### Requirement: Standard Non-Streaming Endpoint & Response Contract
The public surface of the chatbot system SHALL be a single non-streaming endpoint `POST /api/chat` returning JSON `{ text: string }` with `Content-Type: application/json`. Streaming response negotiation (`Accept: text/event-stream` or `?stream=1`) SHALL NOT be supported. Every response text SHALL pass through `sanitize_urls()` post-processing at a single trustworthy point prior to JSON serialization.

#### Scenario: Requesting chat response via standard JSON
- **WHEN** a client sends a `POST /api/chat` request with JSON body `{ "messages": [...] }`
- **THEN** the server returns status 200 with `Content-Type: application/json` and body `{ "text": "..." }` containing the full sanitized response.

#### Scenario: Client requesting event-stream header or stream query param
- **WHEN** a client sends a `POST /api/chat` request with `Accept: text/event-stream` or `?stream=1`
- **THEN** the server treats the request as a standard JSON request and returns a standard JSON object `{ "text": "..." }`.
