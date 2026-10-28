## 1. Security: Safe Domain Gating for zalo.me

- [x] 1.1 Extend `TRUSTED_DOMAINS` in `lib/security/sanitize.js` to accept `zalo.me` (suffix-scoped, keeping spoofing protection).
- [x] 1.2 Extend `TRUSTED_DOMAIN_RE` in `public/markdown.js` to accept `zalo.me`.
- [x] 1.3 Add `https://zalo.me` to the system-prompt SECURITY RULES in `lib/knowledge/system-prompt.js` without altering existing required substrings.

## 2. Modular Knowledge Loading & Content

- [x] 2.1 Update `lib/knowledge/loader.js` to scan `.agents/skills/vipassana-ucenlist-knowledge/` for auxiliary `.md` files alongside `SKILL.md` and concatenate their contents.
- [x] 2.2 Create `.agents/skills/vipassana-ucenlist-knowledge/group-sitting.md` with Section 14 (`## 14. OFFLINE GROUP SITTING`) and Section 14-VI (`## 14-VI. THIỀN CHUNG OFFLINE`) containing Hanoi group sitting details and the Zalo link `https://zalo.me/g/udknri223`.

## 3. Retrieval, Routing & Out-of-Scope

- [x] 3.1 In `lib/knowledge/retrieval/kb.js`, update guide-section exclusion from `id >= 11` to `[11, 12, 13]` so Section 14 is indexed by BM25.
- [x] 3.2 In `lib/chatbot/out-of-scope.js`, exempt queries containing "thien chung" / "group sitting" from being detected as out-of-scope.
- [x] 3.3 In `lib/chatbot/router/index.js`, add "thiền chung", "thien chung", "group sitting" keywords to `KB_STRONG`.
- [x] 3.4 In `lib/chatbot/quick-answers/index.js`, add deterministic quick answers for group sitting queries.

## 4. Testing & Verification

- [x] 4.1 Update `tests/sanitize.test.mjs` with assertions for `zalo.me` URL pass-through and spoofing rejection.
- [x] 4.2 Update `tests/markdown.test.mjs` with an assertion for `zalo.me` link rendering.
- [x] 4.3 Update `tests/out-of-scope.test.mjs` ensuring "nhóm thiền chung" and "group sitting" are not flagged as out-of-scope.
- [x] 4.4 Update `tests/sections.test.mjs` asserting Section 14 is parsed and selected on group sitting queries.
- [x] 4.5 Update `tests/quick-answers.test.mjs` asserting deterministic quick answer for thiền chung.
- [x] 4.6 Run `npm test` and verify all tests pass.
