## 1. Dependency

- [x] 1.1 Install `wink-bm25-text-search@^3.1.2` and confirm `package.json` + lockfile updated

## 2. Retrieval engine (`lib/retrieval.js`)

- [x] 2.1 Implement tokenization prep task reusing `normalize()` (diacritics + lowercase) with whitespace tokenization and a 2-char minimum token length
- [x] 2.2 Build a module-cached BM25 index from `parseSections(loadKnowledgeBase())` (kb docs, id `<n>[-VI]`) plus a curated bilingual tools exemplar corpus (tools docs, id `tools:<n>`)
- [x] 2.3 Implement `retrieve(text, k)` returning ranked `{ id, score, cls }`
- [x] 2.4 Implement `classifyByRetrieval(text)` returning `{ kind: "kb"|"tools"|"ambiguous", kbScore, toolsScore }` with `FLOOR`/`MARGIN` constants
- [x] 2.5 Implement `selectSectionsByRetrieval(text, lang, k)` returning matched section ids in the detected language

## 3. Section selection refactor (`lib/sections.js`)

- [x] 3.1 Replace the `SECTION_KEYWORDS` loop in `selectSections()` with retrieval-based selection, keeping `ALWAYS_ON_SECTIONS` and the sections 1+2 default fallback
- [x] 3.2 Keep exported signatures (`parseSections`, `getSection`, `selectSections`, `buildFastPathSystemPrompt`) unchanged
- [x] 3.3 Verify pinned `tests/sections.test.mjs` behaviors still pass (EN §2, VI §6, EN §7, "zzzqwerty"→1+2, output < half KB)

## 4. Classifier refactor (`lib/router.js`)

- [x] 4.1 Insert `classifyByRetrieval` into `classifyIntent()` for the ambiguous bucket, before `classifyWithLLM()`; preserve tools-on-failure default
- [x] 4.2 Keep `classifyLocal()` byte-identical; verify pinned `tests/router.test.mjs` outputs unchanged

## 5. Tests

- [x] 5.1 Add `tests/retrieval.test.mjs` covering prep/tokenization, top-k ranking, margin classification, and section selection
- [x] 5.2 Extend `tests/sections.test.mjs` with paraphrase cases that previously missed the keyword map
- [x] 5.3 Extend `tests/router.test.mjs` with deterministic retrieval resolution cases
- [x] 5.4 Run the full `npm test` suite and confirm zero regressions

## 6. Verification

- [x] 6.1 Confirm no new `api/*.js` functions and no changes to the static `KNOWLEDGE_SYSTEM_PROMPT` string
- [x] 6.2 Run `openspec validate` on the change and resolve any issues
