# Change Proposal: Remove Streaming Response

## Why
Revert the SSE streaming response mechanism (`Accept: text/event-stream`, `?stream=1`, `lib/stream.js`, `RollingSanitizer`, `SSEWriter`) and return `POST /api/chat` to a standard, non-streaming JSON response model (`{ text }`). Streaming SSE chunks introduced extra runtime complexity, rolling sanitization overhead, and client watchdog/rendering artifacts. Reverting to standard JSON responses guarantees predictable payload delivery and simpler client-side state management.

## What Changes
1. **API Endpoint (`api/chat.js`)**: Remove SSE streaming negotiation and streaming handlers (`generateAgentStream`, `streamFastPath`, `streamToolPath`, `streamChatCompletion`, `RollingSanitizer`, `SSEWriter`). Standardize on `generateAgentResponse()` returning `{ text }` with `Content-Type: application/json`.
2. **Core Library**: Remove `lib/stream.js`.
3. **Frontend (`public/index.html`)**: Simplify `sendMessage()` to issue standard POST requests, show a "Thinking..." indicator, and render the complete Markdown response upon JSON receipt.
4. **Tests**: Remove `tests/stream.test.mjs`.

## Non-Goals
- Changing the underlying router, tool execution logic, or knowledge sectioning logic.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `chatbot-agent`: Document standard non-streaming JSON endpoint contract.
