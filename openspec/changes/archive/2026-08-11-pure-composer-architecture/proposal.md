## Why

Currently, the assistant uses OpenAI-style function tool calling (`tools: [...]`) during the LLM tool loop. This causes multi-turn latency, model reasoning stalls, JSON tool parsing failures, and UI hangs where the chat client gets stuck on status messages such as "Đang tổng hợp câu trả lời… / Compiling the answer…". 

Re-architecting the assistant to use OpenCode LLM as a **Pure Composer** eliminates tool calling system-wide (`tools: false` everywhere). Node.js server-side code pre-fetches and pre-assembles all necessary context (Knowledge Base sections, live course schedule from scraper/cache, center info) into the system prompt, allowing the LLM to generate the final response in a single-pass stream without tool calls.

## What Changes

- **Pure Composer Architecture**: OpenCode LLM never receives tool definitions or executes function tool calls (`tools: false` on 100% of LLM calls).
- **Server-Side Context Pre-Assembly**: Node.js pre-fetches live course schedules (`listCourses()`), center info, and SKILL.md knowledge sections directly before calling the LLM.
- **Single-Pass Streamed Response**: Eliminates multi-turn tool loops in `api/chat.js` (`streamToolPath`), replacing them with single-pass prompt + context composition.
- **Enhanced Deterministic Fast Path**: All bare and windowed schedule queries ("Lịch khóa thiền Vipassana", "Lịch thiền", "cuối tháng này") are served instantly from cache/scraper in < 10ms with zero LLM calls.
- **Client Stream Resilience**: Web UI automatically cleans up status banners and recovers cleanly if stream connections drop or stall.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `chatbot-agent`: LLM function tool calling is removed; response generation becomes a single-pass composer stream over server-assembled prompt context.
- `course-discovery`: Schedule queries use pre-fetched course data and deterministic fast-path formatting without relying on LLM tool calls.
- `intent-routing`: Intent classification routes requests directly to single-pass composer or deterministic fast paths without tool loop fallbacks.

## Impact

- `api/chat.js`: Replaced multi-turn tool loop (`streamToolPath`) with single-pass context composition.
- `lib/schedule-answers.js`: Expanded deterministic schedule triggers to cover bare schedule queries ("Lịch khóa thiền Vipassana").
- `public/index.html`: Streamlined SSE handling and added client stream watchdog cleanup.
- `tests/*`: Updated chat-path, router, and schedule-answers test suites for single-pass composer contract.
