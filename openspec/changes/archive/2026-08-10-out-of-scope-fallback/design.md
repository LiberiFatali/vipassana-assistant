## Context

`api/chat.js` routes every request through `classifyIntent()` into two paths. The KB fast path (`route.kind === "kb"`) serves deterministic quick answers, then a single LLM call with a trimmed knowledge context and **no tools**. For out-of-scope factual questions (e.g. "Cho tôi hỏi nhóm thiền ở Hà Nội?"), `classifyLocal()` matches no signal and defaults to `kb`, and the free model then produces a hollow promise ("Tôi sẽ tìm thông tin…") that dead-ends because the fast path cannot search. BM25 retrieval cannot be used as a negative signal: it returns non-empty sections for nearly every query (even "Thời tiết hôm nay?" scores `[2,7,3]`). The existing system prompt only says "You do NOT handle general topics", which the model ignores.

The fix must be deterministic and applied early, plus hardened at the prompt level for coverage of phrasings the pattern list misses.

## Goals / Non-Goals

**Goals:**
- Answer clearly out-of-scope factual questions (meditation groups/clubs/communities) with a static bilingual "don't know — contact center/admin" message, with **zero LLM calls**.
- Apply the gate before intent routing on both the non-streaming and streaming response paths.
- Harden the system prompt so the model never promises lookups it cannot perform.
- Keep every existing output flowing through `sanitize_urls()`.

**Non-Goals:**
- Chitchat/identity questions ("Tell me about yourself", "bạn khỏe không") — unchanged behavior.
- Detecting every possible out-of-scope topic; keyword coverage is deliberately narrow (meditation-group semantics), with the prompt hardening as the catch-all.
- Changing the router's `classifyLocal` output or the existing test-pinned routing expectations.

## Decisions

### D1: Dedicated `lib/out-of-scope.js` module
Mirror the `quick-answers.js` convention: a deterministic module exporting `detectOutOfScope(text)` (boolean) and `getOutOfScopeAnswer(text, lang)` (`string | null`). Patterns are matched against the existing `normalize()` output (lowercase + diacritic-stripped) so "nhóm thiền" == "nhom thien".

- Pattern list (all multi-word, deliberately specific to avoid colliding with in-scope language):
  - VI: `nhom thien`, `thien nhom`, `nhom thien dinh`, `cau lac bo thien`, `cong dong thien`, `thien cung nhau`
  - EN: `meditation group`, `meditation club`, `group meditation`, `group vipassana`
- Rationale: multi-word patterns cannot false-positive on "khóa thiền" (`khoa thien`) or "đăng ký theo nhóm" (`dang ky theo nhom`). `hội thiền` (`hoi thien`) is deliberately **excluded**: after diacritic-stripping it is byte-identical to "hỏi thiền" ("Cho tôi hỏi thiền là gì?"), so including it would hijack legitimate knowledge questions.
- Alternative considered (rejected): retrieval score-floor / empty-section detection — proven unusable because BM25 returns sections for every query.

### D2: Gate at the top of both response paths, before routing
Call `getOutOfScopeAnswer(userText, route.lang)` at the top of `generateAgentResponse()` (non-streaming) and `runStream()` (streaming), before `classifyIntent()`. When it returns a string, `return sanitize_urls(oos)` immediately.

- Rationale: placing it before routing makes it override both the KB fast path and the tool path, so combos like "khi nào nhóm thiền họp?" (which contains the `khi nào` TOOLS signal) return the fallback instead of course dates. The multi-word patterns are safe to apply globally.
- Language comes from `detectLanguage(userText)` (same as the router) so the answer matches the user's language.

### D3: Static bilingual answer with a single contact point
Both languages reference only the general contact email `info@ucenlist.org` (per user decision) and name the UCENLIST meditation center / admin team. The message passes through `sanitize_urls()` like every other output path.

### D4: Prompt hardening (defense-in-depth)
Append an **OUT-OF-SCOPE** section to `KNOWLEDGE_SYSTEM_PROMPT` instructing the model to never promise to find/search information it cannot access, and to say it does not have the information and direct the user to the meditation center / admin team (`info@ucenlist.org`) for anything not covered by the knowledge base and not about course schedules. Appending (not rewriting) is safe because `tests/sanitize.test.mjs` and `tests/sections.test.mjs` assert with `.includes(...)` on existing phrases.

### D5: Both streaming and non-streaming must behave identically
The streaming path (`runStream` → `sse.done(...)`) returns the fallback as a single `done` event with no `delta`/`status`, mirroring the deterministic quick-answer short-circuit convention already in the codebase.

## Risks / Trade-offs

- **Pattern list is narrow** → The prompt hardening (D4) is the catch-all for out-of-scope phrasings the keywords miss; the deterministic gate covers the specific observed failure mode.
- **OOS pattern collides with future legit phrasing** (e.g. a future "nhóm thiền" course concept) → Patterns are narrowly scoped to group/club/community semantics; revisit the list if UCENLIST adds such offerings.
- **Contact email becomes stale** → Single constant in `lib/out-of-scope.js`; update alongside `SKILL.md`/`lib/centers.js` when contacts change.
- **Prompt addition changes byte content** → Tests assert via `.includes()`, so appending is safe; keep existing phrases verbatim.

## Migration Plan

Pure additive change. Ship as a normal deploy (Vercel function). Rollback = revert the `api/chat.js` gate and prompt addition; the module being unused is harmless.

## Open Questions

None — scope, contacts, and chitchat handling were confirmed with the user during proposal.
