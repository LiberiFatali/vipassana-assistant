## Context

The chatbot (`api/chat.js`) currently treats every request identically:

1. It injects the **entire 44KB `SKILL.md`** (`api/knowledge.js` → `{knowledge_base}` placeholder) into the system prompt.
2. It attaches all three tools (`list_courses`, `get_course_details`, `get_center_info`) with `tool_choice: "auto"` and loops up to 5 LLM steps.
3. Any `list_courses` call may hit the live scraper (`api/scraper/vri-schedule.js`, 8s timeout per center, two centers scraped **sequentially**), then require an extra LLM call to synthesize the answer.

For a question fully answerable from the knowledge base (e.g. "What is Vipassana?", "giới luật khóa thiền 10 ngày"), this pays the cost of a ~12k-token prompt processed by a free model, plus the risk of spurious tool calls — with no benefit.

The `SKILL.md` is well-structured: 13 numbered English sections (`## 1. …` … `## 13. …`) and their Vietnamese mirrors (`## 1-VI. …` … `## 12-VI. …`), which makes section-level retrieval natural.

Separately, the repo still documents the retired Python/ADK layout (`CLAUDE.md`) and ships Claude Code–specific config (`.claude/`), redundant now that development happens in opencode, which reads `AGENTS.md`.

Constraints that must be preserved:
- Public contract `POST /api/chat → { text }`, non-streaming, `sanitize_urls()` applied on the final text (the single trustworthy sanitization point).
- The static `KNOWLEDGE_SYSTEM_PROMPT` string in `api/system-prompt.js` is grep-asserted verbatim by `tests/sanitize.test.mjs` (exact phrases like `language="vi"`, `⚠️`, "NEVER fill out", "Please click the link") — it must stay byte-for-byte unchanged.
- Security model (domain gating, human-in-the-loop registration, prompt-injection backstop) must be preserved on both paths.

## Goals / Non-Goals

**Goals:**
- Knowledge-base-only questions answered in a single LLM call: trimmed prompt (only relevant sections), no tools attached.
- Reliable, conservative routing between the fast path and the tool path, in both English and Vietnamese.
- Course-query path not degraded; multi-center scraping parallelized and concurrent requests deduplicated.
- Repository docs and agent-instructions migrated from Claude Code to opencode (`AGENTS.md`), stale docs removed, specs aligned with the Node implementation.

**Non-Goals:**
- Streaming responses (keeps the sanitize-at-end invariant).
- Shared cross-instance schedule cache (e.g. Vercel KV/Upstash) — a follow-up if warm-cache hit rate proves insufficient.
- Any change to the public API shape, the security model, or the `KNOWLEDGE_SYSTEM_PROMPT` static string.
- Rewriting the scraper or data formats.

## Decisions

### D1. Hybrid intent router (`api/router.js`)
Classify the latest user message into `"kb"` (fast path), `"tools"` (slow path), or `"ambiguous"`.

- **Strong TOOLS signals** (bilingual) → tools path immediately. EN: `schedule`, `upcoming`, `next course`, `register`, `apply`, `full`, `waitlist`, `deadline`, `spots`, `open course`, `when` + course words… VI: `lịch`, `lịch khai giảng`, `đăng ký`, `còn chỗ`, `hết chỗ`, `đã đầy`, `khai giảng`, `sắp tới`…
- **Strong KB signals** (e.g. `what is vipassana`, `giới luật`, `thời khóa biểu` for the *daily* timetable, `liên hệ`, `địa chỉ`…) → kb path.
- **Ambiguous** (bare `course`/`khóa`, `satipatthana`, center names alone…) → LLM classifier.
- Otherwise → kb path.

The LLM classifier is a single tiny call (`max_tokens ≈ 8`, `temperature 0`) returning `TOOLS` or `KNOWLEDGE`, with its own short timeout (~2.5s). **On timeout/failure it returns `tools`** — a conservative default: a misroute to the slow path only costs latency, while a misroute to the fast path could serve stale data.

Rationale vs alternatives: a pure-keyword router is free but brittle for Vietnamese phrasing; a pure-LLM router is more accurate but adds a round trip to *every* request. The hybrid limits the extra round trip to genuinely ambiguous queries.

Also returns the detected language (`"vi" | "en"`) from the same pass, reused by section selection.

### D2. Knowledge sectioning (`api/sections.js`)
- Parse `SKILL.md` once (module-cached) into sections using the stable header format `^## (\d+)(-VI)?\.`. Build a `[{ id, title, en|vi, text }]` list plus a keyword → section index.
- `selectSections(text, lang)` returns the matched section(s) in the detected language, **plus always-on sections**: `11 KEY PRINCIPLES`, `12 QUICK REFERENCE`, `13 LANGUAGE GUIDE` (these encode chatbot behavior and are small).
- Distinguish the two "timetable" senses: `thời khóa biểu` / "daily timetable" → KB section 7; `lịch khai giảng` / "course schedule" → tools signal.

Rationale: the 44KB full-KB prompt is the dominant cost; sectioning cuts the fast-path prompt to roughly 2–6KB while guaranteeing the answer context is present. A vector store is overkill for 13 static sections.

### D3. Fast-path prompt construction (`api/chat.js`)
- KB path: build `system = KNOWLEDGE_SYSTEM_PROMPT.replace("{knowledge_base}", selectedSectionsText)` and send **one** chat-completions call with **no `tools` field**.
- Sanitize the single response with `sanitize_urls()` and return.
- Because we reuse the existing template string, the eval-grepped phrases and all security instructions remain present on the fast path automatically.
- The tool path keeps the current behavior (full KB + full tool registry) unchanged.

### D4. Slow-path hardening (`api/tools/list-courses.js`, `api/scraper/cache.js`)
- For `center="all"`, scrape both centers with `Promise.all` instead of a `for` loop (worst case 16s → 8s).
- Add a module-level in-flight promise map keyed by `${center}_${language}` so concurrent identical requests within a warm instance share a single fetch; entries are removed on settle.

### D5. Docs and spec migration
- New root `AGENTS.md` (rewritten from `CLAUDE.md` for the Node/Vercel project and opencode conventions), then delete `CLAUDE.md` and `rm -rf .claude/`.
- Rewrite `openspec/specs/chatbot-agent/spec.md` as a full delta (all requirements MODIFIED with Node-accurate mechanism, fallback text, and current center address).
- Add an intent-routing requirement set (`specs/intent-routing/spec.md`, new capability) and a project-hygiene ADDED requirement for canonical agent instructions.
- README: one-line pointer to `AGENTS.md`.

## Risks / Trade-offs

- **[Router false-positive: live-data question routed to KB fast path]** → Mitigation: any strong tools signal short-circuits to the tool path; ambiguity goes through the LLM classifier; classifier failure defaults to tools. The fast path is only taken when routing is confident.
- **[Router false-negative: KB question routed to tool path]** → Acceptable by design: only extra latency, never wrong data.
- **[Section index misses the right section]** → Mitigation: always-on QUICK REFERENCE + KEY PRINCIPLES sections; conservative routing; the full tool path still carries the entire KB as a safety net.
- **[LLM classifier latency on ambiguous queries]** → Bounded: tiny `max_tokens`, 2.5s timeout; and it only runs on the ambiguous subset.
- **[Docs removal surprises Claude Code users]** → Called out as **BREAKING** in the proposal; `AGENTS.md` is readable by most agent tools.
- **[Regression in eval suite]** → Mitigation: `KNOWLEDGE_SYSTEM_PROMPT` string is untouched; new unit tests cover the router, sectioning, and fast-path prompt.

## Migration Plan

1. Implement `api/router.js` + `api/sections.js` + fast path in `api/chat.js`; add tests.
2. Harden `list-courses.js` (parallel + dedup); add tests.
3. Run `npm test`; verify all existing suites green.
4. Manual timing check via `npm run dev` + `curl` on a KB question and a course question.
5. Docs: write `AGENTS.md`, delete `CLAUDE.md` and `.claude/`, update specs + README.
6. Final `npm test` + `openspec validate`; leave committing/staging to the user.

## Open Questions

None blocking. (Cross-instance schedule caching and streaming are documented follow-ups.)
