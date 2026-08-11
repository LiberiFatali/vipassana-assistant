## 1. Deterministic Schedule Fast-Path & Context Pre-Fetching

- [x] 1.1 Update `lib/schedule-answers.js` to catch bare schedule queries ("Lịch khóa thiền Vipassana", "Lịch thiền", "danh sách khóa thiền") for the 0-LLM fast path.
- [x] 1.2 Add server-side pre-fetched schedule context builder `buildLiveScheduleContext(userText, lang)` in `lib/schedule-answers.js`.

## 2. Universal Pure Composer Handler (`api/chat.js`)

- [x] 2.1 Remove OpenAI function tool definitions payload (`tools: [...]`) from `api/chat.js` so all LLM API calls execute with `tools: false`.
- [x] 2.2 Refactor `streamToolPath` into a single-pass composer stream that pre-fetches live course schedule context and calls the LLM in a single turn.
- [x] 2.3 Refactor non-streaming `generateAgentResponse` to use single-pass context assembly without function tool calling loops.

## 3. Client Web UI Resilience (`public/index.html`)

- [x] 3.1 Simplify SSE stream status handling in `public/index.html` for single-pass responses.
- [x] 3.2 Add a client-side stream watchdog and cleanup logic to remove lingering status indicators if stream drops.

## 4. Test Suite Alignment & Verification

- [x] 4.1 Update `tests/schedule-answers.test.mjs` with bare schedule query assertions ("Lịch khóa thiền Vipassana").
- [x] 4.2 Update `tests/chat-path.test.mjs` and `tests/router.test.mjs` to verify single-pass composer behavior without tool definitions.
- [x] 4.3 Run `npm test` to verify all test suites pass.
