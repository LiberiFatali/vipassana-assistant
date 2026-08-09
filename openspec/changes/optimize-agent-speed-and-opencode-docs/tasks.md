## 1. Intent Router

- [x] 1.1 Create `api/router.js` with a bilingual (EN/VI) keyword classifier: strong TOOLS signals, strong KB signals, ambiguous, and language detection for the latest user message.
- [x] 1.2 Add the LLM classifier fallback for ambiguous queries (tiny `max_tokens`, `temperature 0`, ~2.5s timeout, conservative default to the tool path on failure).

## 2. Knowledge Sectioning

- [x] 2.1 Create `api/sections.js`: parse `SKILL.md` once (module-cached) into its numbered EN/VI sections and build a keyword → section index.
- [x] 2.2 Implement `selectSections(text, lang)` returning the matched sections plus always-on guide sections (11 KEY PRINCIPLES, 12 QUICK REFERENCE, 13 LANGUAGE GUIDE), distinguishing daily-timetable (`thời khóa biểu`) from course-schedule (`lịch khai giảng`).

## 3. Fast Path in api/chat.js

- [x] 3.1 Route each request through the intent router in `generateAgentResponse`.
- [x] 3.2 Implement the knowledge-only fast path: single LLM call with the trimmed prompt and **no tools attached**, then `sanitize_urls()` on the final text.
- [x] 3.3 Keep the tool path unchanged (full knowledge base + full tool registry).

## 4. Slow-Path Hardening

- [x] 4.1 Parallelize `center="all"` scraping with `Promise.all` in `api/tools/list-courses.js`.
- [x] 4.2 Add module-level in-flight dedup so concurrent identical `(center, language)` scrapes share one fetch.

## 5. Tests

- [x] 5.1 Add `tests/router.test.mjs` covering EN/VI knowledge-only, live-data, and ambiguous routing cases.
- [x] 5.2 Add `tests/sections.test.mjs` covering section selection, language detection, fast-path prompt size reduction, and absence of tool schemas in the fast-path request.
- [x] 5.3 Run `npm test` and confirm all suites (existing + new) pass.

## 6. Docs & Repo Migration

- [x] 6.1 Write root `AGENTS.md` (rewritten from `CLAUDE.md` for the Node/Vercel project and opencode conventions, including security model and eval-phrase caveat).
- [x] 6.2 Delete `CLAUDE.md`.
- [x] 6.3 Delete the `.claude/` directory.
- [x] 6.4 Update `README.md` with a pointer to `AGENTS.md`.

## 7. Spec Delta Verification

- [x] 7.1 Run `openspec validate` on the change and confirm the delta specs (intent-routing new capability, chatbot-agent full rewrite, project-hygiene addition) are valid.
