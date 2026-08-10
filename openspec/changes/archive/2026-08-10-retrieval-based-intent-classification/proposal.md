## Why

Intent classification (`lib/router.js`) and fast-path section selection (`lib/sections.js`) rely on hand-curated keyword lists, so paraphrase variants miss and fall through to a flaky LLM classifier (2.5s timeout, often wasted), while sections silently default to a generic subset. Searching the actual knowledge base lets the system match the *content* of a question instead of a fixed vocabulary.

## What Changes

- Add a bilingual BM25 retrieval engine (`lib/retrieval.js`) built on `wink-bm25-text-search`, indexing every SKILL.md section (EN + VI) as `kb` documents plus a small curated bilingual `tools` exemplar corpus so retrieval can discriminate knowledge-only vs live-data intent.
- Replace the keyword→section mapping in `lib/sections.js` `selectSections()` with retrieval-based section selection (same exported API).
- Resolve the `ambiguous` bucket in `lib/router.js` `classifyIntent()` with a deterministic retrieval margin before falling back to the LLM classifier; `classifyLocal()` stays byte-identical.
- Vietnamese tokenization is space-delimited with the existing diacritic stripper — no Vietnamese NLP library needed.
- Add `wink-bm25-text-search` as a runtime dependency (only `wink-helpers` loads at import; the English wink-nlp model is never imported).

## Capabilities

### New Capabilities
- `kb-retrieval`: bilingual BM25 retrieval over the static knowledge base that ranks KB sections and tool-intent exemplars for a given query.

### Modified Capabilities
- `intent-routing`: ambiguous requests are now resolved deterministically by retrieval before the LLM classifier; the conservative tools-on-failure default is preserved.
- `fast-kb-answers`: fast-path section selection is driven by retrieval over the full section text instead of keyword lists.

## Impact

- **Code**: `lib/retrieval.js` (new), `lib/sections.js`, `lib/router.js`.
- **Dependencies**: `wink-bm25-text-search@^3.1.2` (+ transitive `wink-helpers`, `wink-nlp`, `wink-nlp-utils`, `wink-eng-lite-web-model`; only `wink-helpers` loaded at runtime).
- **Tests**: new `tests/retrieval.test.mjs`; extended `tests/sections.test.mjs`, `tests/router.test.mjs`.
- **Invariants preserved**: `classifyLocal()` outputs, exported function signatures, static `KNOWLEDGE_SYSTEM_PROMPT` string, no new `api/*` functions, `sanitize_urls()` gate, no-tools fast path, full-KB tool path, quick-answers untouched.
