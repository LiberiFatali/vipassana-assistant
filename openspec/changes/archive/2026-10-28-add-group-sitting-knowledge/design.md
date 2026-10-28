## Context

UCENLIST Hanoi (Dhamma Virocana) organizes regular offline group sittings with assistant teachers. Details and schedule are shared via an official Zalo group (`https://zalo.me/g/udknri223`). Currently:
1. The static knowledge base has no record of offline group sittings.
2. The trusted domain gate (`TRUSTED_DOMAINS` in `lib/security/sanitize.js`, `TRUSTED_DOMAIN_RE` in `public/markdown.js`, and system prompt security rules) only allows `ucenlist.org` and `vridhamma.org`, stripping the Zalo link.
3. `lib/chatbot/out-of-scope.js` intercepts terms like "nhom thien", "group meditation" as out-of-scope, which would block queries about Hanoi group sitting.
4. `lib/knowledge/loader.js` loads only a single static `SKILL.md` file rather than allowing modular auxiliary knowledge documents.

## Goals / Non-Goals

**Goals:**
- Enable multi-file knowledge base loading in `lib/knowledge/loader.js` (reading `SKILL.md` and auxiliary markdown files in alphabetical order).
- Add offline group sitting knowledge in `.agents/skills/vipassana-ucenlist-knowledge/group-sitting.md` as Section 14 (EN/VI).
- Extend safe domain gating in both server and client to permit `zalo.me` URLs while maintaining anti-spoofing protections.
- Update BM25 retrieval index in `lib/knowledge/retrieval/kb.js` to index sections beyond 13 (exempting only guide sections 11-13).
- Exempt group sitting queries ("thiền chung", "group sitting") from the deterministic out-of-scope detector in `lib/chatbot/out-of-scope.js`.
- Provide high-speed deterministic quick answers for group sitting queries in `lib/chatbot/quick-answers/index.js`.

**Non-Goals:**
- Completely rewriting or splitting existing sections 1-13 out of `SKILL.md` (deferred to a dedicated refactoring phase).
- Allowing arbitrary external domains other than `zalo.me`.

## Decisions

### D1. Modular Knowledge Loader in `lib/knowledge/loader.js`
`loader.js` reads `SKILL.md` and scans the skill directory for other `.md` files (e.g. `group-sitting.md`). It concatenates them with newlines and caches the combined string.
- *Rationale*: Keeps `SKILL.md` as the valid agent skill specification entrypoint while enabling clean, modular topical extensions.

### D2. Group Sitting Section Numbering (14 & 14-VI)
The new file `.agents/skills/vipassana-ucenlist-knowledge/group-sitting.md` uses:
`## 14. OFFLINE GROUP SITTING` and `## 14-VI. THIỀN CHUNG OFFLINE`.
- *Rationale*: Preserves the exact parsing contract of `lib/knowledge/parser.js` (`SECTION_HEADER_RE = /^## (\d{1,2})(-VI)?\.\s+(.+)$/`) without breaking any downstream section indexing or prompt assembly.

### D3. BM25 Guide Section Whitelist
In `lib/knowledge/retrieval/kb.js`, change `if (section.id >= 11) continue;` to `const GUIDE_SECTION_IDS = new Set([11, 12, 13]); if (GUIDE_SECTION_IDS.has(section.id)) continue;`.
- *Rationale*: Ensures Section 14 is indexed into the BM25 search corpus and dynamically selectable on the fast path.

### D4. Safe Domain Gating for `zalo.me`
Update regexes in `lib/security/sanitize.js` and `public/markdown.js` to:
`^https?:\/\/([a-zA-Z0-9-]+\.)*(vridhamma\.org|ucenlist\.org|zalo\.me)([/?#]|$)`.
Update `lib/knowledge/system-prompt.js` security rules to list `https://zalo.me`.
- *Rationale*: Preserves prompt+code dual enforcement while allowing the official Zalo group URL to reach users. Suffix-scoped check prevents spoofing (e.g. `zalo.me.evil.com`).

### D5. Out-of-Scope Exemption & Router Signals
In `lib/chatbot/out-of-scope.js`, add an exemption: if normalized text contains `"thien chung"` or `"group sitting"`, it is not out-of-scope.
In `lib/chatbot/router/index.js`, add "thiền chung", "thien chung", "group sitting" to `KB_STRONG`.

### D6. Deterministic Quick Answer
In `lib/chatbot/quick-answers/index.js`, add a direct match for common group sitting phrases returning the curated group sitting text with link, achieving <5ms response latency.

## Risks / Trade-offs

- [Risk] Overriding out-of-scope could allow unrelated meditation club questions to slip through.
  - *Mitigation*: Strictly narrow exemption to queries matching "thien chung" or "group sitting", not broad "nhom thien" without "chung".
