## Why

When a user asks a question that is neither in the static knowledge base nor about live course schedules (e.g. "Cho tôi hỏi nhóm thiền ở Hà Nội?"), the KB fast path sends it to the free-model LLM with no tools and a trimmed knowledge context. The model often replies with a hollow promise like "Tôi sẽ tìm thông tin về khóa thiền tại Hà Nội cho bạn nhé." and then stops — a dead-end answer that never delivers. The system prompt only says "You do NOT handle general topics", which the model ignores. The bot should instead answer that it does not have that information and direct the user to contact the UCENLIST meditation center / admin team.

## What Changes

- Add a deterministic out-of-scope detector and static bilingual fallback answer so clearly out-of-scope factual questions (meditation groups, clubs, communities) are answered without any LLM call.
- Apply the out-of-scope gate at the top of both the non-streaming (`generateAgentResponse`) and streaming (`runStream`) response paths in `api/chat.js`, before intent routing, so it overrides both the KB fast path and the tool path.
- Harden `KNOWLEDGE_SYSTEM_PROMPT` with an explicit OUT-OF-SCOPE instruction: never promise to find/search information the agent cannot access, and direct the user to the meditation center / admin team (info@ucenlist.org) for anything not covered by the knowledge base or course schedules.
- Do **NOT** change behavior for chitchat/identity questions ("Tell me about yourself", "bạn khỏe không") — those keep the current LLM behavior.

## Capabilities

### New Capabilities
- `out-of-scope-fallback`: Deterministic detection of out-of-scope factual questions (bilingual, diacritic-insensitive) and a static "I don't know — contact the meditation center / admin team" fallback answer, enforced on both response paths before routing.

### Modified Capabilities
<!-- No requirement-level changes to existing specs. -->

## Impact

- `lib/out-of-scope.js` (new): `detectOutOfScope(text)` + `getOutOfScopeAnswer(text, lang)`.
- `api/chat.js`: gate in `generateAgentResponse` and `runStream`.
- `lib/system-prompt.js`: appended OUT-OF-SCOPE section (existing tests only grep `.includes(...)`, so appending is safe).
- Tests: new `tests/out-of-scope.test.mjs`; additions to `tests/chat-path.test.mjs` (JSON + streaming, 0 LLM calls).
