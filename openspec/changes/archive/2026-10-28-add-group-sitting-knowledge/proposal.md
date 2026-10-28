## Why

Trung tâm Ucenlist Hà Nội (Dhamma Virocana) organizes regular offline group sittings (thiền chung offline) in Hanoi accompanied by assistant teachers, with activity information coordinated through the official Zalo group `https://zalo.me/g/udknri223`. Currently:
1. The static knowledge base has no record of offline group sittings.
2. The trusted domain gate (`lib/security/sanitize.js`, `public/markdown.js`, and system prompt security rules) only allows `ucenlist.org` and `vridhamma.org`, which would redact the official Zalo group URL as `[🔒 Link removed: only official ucenlist.org and vridhamma.org links are shared]`.
3. `lib/chatbot/out-of-scope.js` intercepts terms like "nhom thien", "group meditation" as out-of-scope, which would block queries about Hanoi group sitting.
4. `lib/knowledge/loader.js` only loads a single static `SKILL.md` file rather than allowing modular auxiliary knowledge documents.

## What Changes

- **Modular Knowledge Loading**: `lib/knowledge/loader.js` is enhanced to load `SKILL.md` as well as any auxiliary `.md` files located in the skill directory, concatenating them so new knowledge topics can live in separate files while preserving `SKILL.md` as the main skill entrypoint.
- **Group Sitting Knowledge**: Add `.agents/skills/vipassana-ucenlist-knowledge/group-sitting.md` with Section 14 (EN: `## 14. OFFLINE GROUP SITTING`) and Section 14-VI (VI: `## 14-VI. THIỀN CHUNG OFFLINE`), containing information about UCENLIST Hanoi's offline group sittings and the official Zalo group link (`https://zalo.me/g/udknri223`).
- **Safe Domain Gating for `zalo.me`**: Extend `TRUSTED_DOMAINS` in `lib/security/sanitize.js`, `TRUSTED_DOMAIN_RE` in `public/markdown.js`, and the system prompt security rules in `lib/knowledge/system-prompt.js` to allow `zalo.me` URLs while maintaining anti-spoofing protections.
- **BM25 Retrieval & Router Support**: Update `lib/knowledge/retrieval/kb.js` so only guide sections (11-13) are excluded from BM25 indexing, allowing Section 14 to be indexed. Add "thiền chung", "group sitting" cues to `KB_STRONG` in `lib/chatbot/router/index.js`.
- **Out-of-Scope Exemption**: Exempt queries with "thiền chung" / "group sitting" from being intercepted as out-of-scope in `lib/chatbot/out-of-scope.js`.
- **Quick Answers Support**: Add deterministic quick answers for direct queries regarding Hanoi group sittings and the official Zalo group in `lib/chatbot/quick-answers/index.js`.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `ucenlist-knowledge`: adds offline group sitting information for UCENLIST Hanoi and official Zalo community coordination.
- `chatbot-agent`: extends Safe Domain Gating to permit official `zalo.me` links.
- `kb-retrieval`: indexes Section 14 and routes group sitting queries to the knowledge fast path.

## Impact

- `.agents/skills/vipassana-ucenlist-knowledge/group-sitting.md` (new): offline group sitting knowledge document (Section 14 / 14-VI).
- `lib/knowledge/loader.js`: multi-file knowledge loader.
- `lib/knowledge/retrieval/kb.js`: index section IDs beyond 13.
- `lib/security/sanitize.js` + `public/markdown.js` + `lib/knowledge/system-prompt.js`: `zalo.me` domain whitelist.
- `lib/chatbot/out-of-scope.js`: allow "thien chung" / "group sitting".
- `lib/chatbot/router/index.js`: `KB_STRONG` additions.
- `lib/chatbot/quick-answers/index.js`: quick answer for group sitting.
- `tests/*`: new and updated assertions for sanitization, markdown rendering, section parsing, retrieval, and out-of-scope.
