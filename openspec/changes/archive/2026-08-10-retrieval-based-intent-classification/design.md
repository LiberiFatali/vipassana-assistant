## Context

Intent classification (`lib/router.js`) and fast-path section selection (`lib/sections.js`) both rely on hand-curated keyword tables matched as substrings against the normalized (diacritic-stripped, lowercased) user message. Paraphrase variants that do not literally contain a keyword fall through to a tiny LLM classifier (`router.js` `classifyWithLLM`, 2.5s timeout, 8 max tokens) whose free reasoning models frequently burn the budget and time out — defaulting to the tool path and adding latency. Section selection misses return a generic default (sections 1+2), so the fast-path prompt can lack the content the model needs.

The knowledge base is a single ~44KB bilingual markdown document (`.agents/skills/vipassana-ucenlist-knowledge/SKILL.md`, 13 EN + 12 VI numbered sections + 1 EN-only guide section). The app is a Vercel serverless Node app with a strict dependency-minimal philosophy (currently `cheerio` + `zod`) and invariants around domain gating, no-tools fast path, and the 12-function-per-deployment limit.

## Goals / Non-Goals

**Goals:**
- Match a question against the *content* of the knowledge base, not a fixed keyword list, so paraphrase variants retrieve the right sections and the right intent.
- Resolve the ambiguous bucket deterministically before the LLM classifier, reducing flaky LLM calls and latency while preserving the conservative tools-on-failure default.
- Bilingual (EN/VI) support with diacritic-free Vietnamese typing handled by the existing `stripDiacritics()`.
- Zero added cold-start cost (nothing heavy loaded at import) and no new `api/*` functions.

**Non-Goals:**
- Semantic/embedding-based matching (vector search, embeddings API) — overkill for a 44KB KB and adds network latency/failure modes.
- Vietnamese word-segmentation libraries (Py/Java ecosystem, unavailable in Node; unnecessary for a space-delimited language at search time).
- Changing quick-answers (`lib/quick-answers.js`) — its strict, conservative matching is deliberate.
- Altering `classifyLocal()`'s pinned outputs — tests depend on them.

## Decisions

### D1: Use `wink-bm25-text-search` with a custom prep task
BM25 is deterministic, dependency-light, and language-agnostic at search time. `wink-bm25-text-search`'s main module imports only `wink-helpers`; `wink-nlp`/`wink-eng-lite-web-model` are transitive deps that are never imported by us, so they add install size but no runtime cold-start cost. We define a custom prep task that reuses the existing `stripDiacritics()`/`normalize()` pipeline plus whitespace tokenization — effectively a Vietnamese-aware tokenizer without a Vietnamese NLP dependency.

- *Alternative considered:* hand-rolled BM25 (~100 lines, zero deps) — rejected by user decision; the maintained implementation is less error-prone.
- *Alternative considered:* embeddings via Zen `/v1/embeddings` — rejected: per-request latency, unverified endpoint, no benefit for lexical paraphrase coverage.
- *Alternative considered:* `wink-nlp` prep pipeline — rejected: English-centric model, heavy load, no Vietnamese value.

### D2: Two-corpus index — KB sections + tools exemplars
The KB only labels the knowledge class; live-data intent has no source content. We index two corpora into one engine:
- **kb docs**: each section from `parseSections(loadKnowledgeBase())` → doc id `<id>[-VI]`, `cls: "kb"`.
- **tools docs**: a curated bilingual exemplar corpus (~12-15 per language) derived from the existing `TOOLS_STRONG` phrases (e.g. "khóa thiền sắp tới", "còn chỗ không", "lịch khóa thiền tháng sau", "is the next course full", "how do I register", "upcoming courses in hanoi"), doc id prefixed `tools:`, `cls: "tools"`.

Scores are used two ways: section selection (kb docs only) and kb-vs-tools classification (compare best kb score vs best tools score).

### D3: Margin-based deterministic classification
`classifyByRetrieval(text)` returns `{ kind: "kb"|"tools"|"ambiguous", kbScore, toolsScore }`:
- if `kbScore >= FLOOR` and `kbScore > toolsScore * MARGIN` → `kb`
- else if `toolsScore >= FLOOR` and `toolsScore > kbScore * MARGIN` → `tools`
- else → `ambiguous`

`FLOOR` and `MARGIN` are single constants tuned during implementation so clear-cut examples from the spec resolve deterministically while the pinned ambiguous cases ("khóa thiền", "satipatthana") stay ambiguous. The LLM classifier remains the final fallback for `ambiguous`.

### D4: Section selection replaces keyword mapping
`selectSections(text, lang)` keeps its signature but internally uses retrieval: top-k kb matches → filter/prioritize the detected language → merge `ALWAYS_ON_SECTIONS` (11, 12, 13) → default to sections 1+2 when nothing clears the floor. This preserves all pinned `sections.test.mjs` behaviors.

### D5: No structural changes to `router.js` flow
`classifyLocal()` stays byte-identical. `classifyIntent()` inserts a retrieval step for the `ambiguous` case before `classifyWithLLM()`. The tools-on-failure default and the `{ kind, lang }` contract are unchanged.

## Risks / Trade-offs

- **[Short-query BM25 noise]** → Vietnamese function words are down-weighted by IDF; margin + floor tuning plus a 2-char minimum token length filter mitigate false tools/kb calls.
- **[Cross-language contamination]** → Language selection in section selection filters by detected language; classification compares across both corpora, where EN/VI tokens rarely overlap after diacritic stripping.
- **[Calibration sensitivity]** → Concrete spec examples may not resolve as written until exemplars are tuned → calibrate against the pinned tests during apply; adjust exemplar corpus, not the tests.
- **[Dependency footprint]** → `wink-bm25-text-search` pulls ~4 transitive packages (~several MB on disk) → only `wink-helpers` is imported at runtime; install size stays far below Vercel limits.
- **[Regression risk on section selection]** → Existing `sections.test.mjs` assertions (EN §2 for "What is Vipassana?", VI §6, EN §7, "zzzqwerty"→1+2, output < half KB) must still pass → verified in apply before proceeding.

## Migration Plan

1. Add dependency, build `lib/retrieval.js` with index + prep + scoring APIs.
2. Refactor `lib/sections.js` to retrieval; run `tests/sections.test.mjs`.
3. Insert retrieval step in `lib/router.js`; run `tests/router.test.mjs`.
4. Add `tests/retrieval.test.mjs`; run full `npm test`.
5. Rollback: revert the three `lib/*` files and the dependency — no data or schema migration involved.

## Open Questions

- Exact `FLOOR`/`MARGIN` values and the top-k section count are determined empirically during apply.
- Whether the tools exemplar corpus should live inline in `lib/retrieval.js` or as a JSON file — inline unless it grows.
