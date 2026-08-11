## Context

The current assistant flow in `api/chat.js` attaches OpenAI function definitions (`tools: [...]`) to the LLM completion payload when handling live-data queries. This triggers a multi-step tool loop (`streamToolPath`), requiring the model to emit tool call JSON, the server to parse and execute the tool, and the server to invoke the model a second time to compose text. This design suffers from high latency, model reasoning stalls, JSON tool call syntax errors, and UI hanging on status events like "Đang tổng hợp câu trả lời… / Compiling the answer…".

## Goals / Non-Goals

**Goals:**
- Eliminate function tool calling system-wide (`tools: false` everywhere).
- Re-architect OpenCode LLM as a single-pass text composer across all question routes.
- Pre-fetch live course schedule data and center info server-side in Node.js before calling the LLM.
- Expand deterministic fast path coverage so queries like "Lịch khóa thiền Vipassana" answer instantly in < 10ms with 0 LLM calls.
- Add client stream watchdog protection in `public/index.html` to recover cleanly from network/stream drops.

**Non-Goals:**
- Changing the underlying scraping logic in `lib/scraper/vri-schedule.js`.
- Modifying static knowledge content in `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md`.

## Decisions

### D1. Single-Pass Composer Flow without Function Calling
Instead of allowing the LLM to trigger `tool_calls`, the Node.js backend pre-assembles all context (SKILL.md sections, pre-fetched live course schedules, center contact info) into the system prompt. The LLM is called exactly once with `{ tools: false }` to stream the final response.
- *Alternatives considered*: Keeping tool calls but reducing max steps — rejected because tool call parsing and model stalls remain possible.

### D2. Deterministic Fast-Path Schedule Query Expansion
Update `detectScheduleIntent` in `lib/schedule-answers.js` so that bare queries containing schedule/course keywords ("Lịch khóa thiền Vipassana", "Lịch thiền", "danh sách khóa thiền") immediately trigger `getScheduleAnswer` without calling the LLM.
- *Alternatives considered*: Routing bare queries to LLM composition — rejected because deterministic schedule formatting is faster (< 10ms) and 100% reliable.

### D3. Pre-Fetched Schedule Context Injection
When a complex or custom live-data query reaches the LLM, Node.js calls `listCourses()` directly, formats the course schedule as a structured markdown/JSON block, and appends it to the system prompt as context.
- *Alternatives considered*: Passing full raw scraper HTML — rejected to keep prompt token size small.

### D4. Client-Side SSE Inactivity Watchdog
In `public/index.html`, add a 15s inactivity watchdog timer that resets on every SSE frame. If no frame arrives for 15s or the connection closes with empty text, the UI clears status banners and presents a clean error fallback.

## Risks / Trade-offs

- [Risk] Larger system prompt for live-data queries due to injected schedule context → *Mitigation*: Format course data concisely, capping the list to upcoming open courses.
- [Risk] Loss of model autonomy in deciding when to query tools → *Mitigation*: Intent router cleanly classifies `kb` vs `tools`, and Node.js pre-fetches all required data deterministically.
