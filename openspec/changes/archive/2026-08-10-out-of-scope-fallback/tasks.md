## 1. New out-of-scope module

- [x] 1.1 Create `lib/out-of-scope.js` exporting `OOS_PATTERNS` (bilingual, normalized multi-word patterns for meditation groups/clubs/communities: `nhom thien`, `thien nhom`, `nhom thien dinh`, `cau lac bo thien`, `cong dong thien`, `thien cung nhau`, `meditation group`, `meditation club`, `group meditation`, `group vipassana`; `hoi thien` excluded because it normalizes identically to `hoi thien` = "hỏi thiền" and would hijack "Cho tôi hỏi thiền là gì?")
- [x] 1.2 Implement `detectOutOfScope(text)` returning true when the normalized text includes any OOS pattern, and `getOutOfScopeAnswer(text, lang)` returning the static bilingual "don't know — contact UCENLIST meditation center / admin team at info@ucenlist.org" message (or null when not out of scope), reusing `normalize`/`detectLanguage` from `lib/router.js`

## 2. Wire the gate into api/chat.js

- [x] 2.1 Import `getOutOfScopeAnswer` in `api/chat.js`
- [x] 2.2 In `generateAgentResponse()`, before intent routing, call `getOutOfScopeAnswer(userText, detectLanguage(userText))` and `return sanitize_urls(oos)` when it is non-null
- [x] 2.3 In `runStream()`, before intent routing, call the same gate and `sse.done(sanitize_urls(oos))` and return when it is non-null
- [x] 2.4 Confirm `find api -name '*.js'` still returns exactly `api/chat.js` (no new serverless function created)

## 3. Harden the system prompt

- [x] 3.1 Append an OUT-OF-SCOPE section to `KNOWLEDGE_SYSTEM_PROMPT` in `lib/system-prompt.js`: never promise to find/search information the agent cannot access; for anything not in the knowledge base and not about course schedules/registration, say you do not have that information and direct the user to the meditation center / admin team at info@ucenlist.org
- [x] 3.2 Keep all existing prompt phrases (`language="vi"`, `language="en"`, "⚠️", "NEVER fill out", "Please click the link") byte-for-byte unchanged

## 4. Tests

- [x] 4.1 Add `tests/out-of-scope.test.mjs`: patterns fire for "Cho tôi hỏi nhóm thiền ở Hà Nội?", "Is there a meditation group in Hanoi?", "câu lạc bộ thiền", "group meditation"; patterns do NOT fire for "What is Vipassana?", "Địa chỉ trung tâm thiền Hà Nội?", "Lịch khóa thiền tháng sau?", "đăng ký theo nhóm", "Tell me about yourself", "bạn khỏe không", "Cho tôi hỏi thiền là gì?"
- [x] 4.2 Add a non-streaming case in `tests/chat-path.test.mjs`: an out-of-scope question returns the static fallback message with 0 LLM requests
- [x] 4.3 Add a streaming case in `tests/stream.test.mjs` (via `Accept: text/event-stream`, where the streaming integration helpers live): an out-of-scope question emits `done` with the fallback message and no `delta`/`status`/LLM requests

## 5. Verification

- [x] 5.1 Run `npm test` and confirm the full suite passes (including existing router/sanitize/sections/stream tests)
