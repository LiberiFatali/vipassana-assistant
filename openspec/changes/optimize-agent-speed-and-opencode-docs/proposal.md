## Why

Chatbot responses to questions that are fully answerable from the static knowledge base are unnecessarily slow: every request injects the entire 44KB `SKILL.md` into the system prompt and attaches all tools (including the scraping `list_courses`), so a knowledge-only question can trigger live scraping and multiple LLM round trips against a free model. Separately, the repository still ships stale documentation for the retired Python/ADK layout and Claude Code-specific config that is redundant now that the user develops with opencode.

## What Changes

- **Intent routing**: introduce a bilingual (EN/VI) router that classifies each request as *knowledge-only* (fast path) or *needs-live-data* (tool path). Ambiguous requests fall back to a tiny LLM classifier (single token, short timeout); on failure they conservatively route to the tool path.
- **Knowledge sectioning**: parse `SKILL.md` into its existing numbered EN/VI sections at load time and build a keyword → section index. The fast path injects only the relevant section(s) plus the always-on guide sections, instead of the full 44KB.
- **Fast path**: knowledge-only requests are answered with a single LLM call, **no tools attached**, and the trimmed context — then passed through the existing `sanitize_urls()` backstop unchanged.
- **Slow-path hardening**: parallelize multi-center scraping (`center="all"`) and deduplicate concurrent in-flight scrapes within a warm instance.
- **Spec alignment**: rewrite the `chatbot-agent` spec to mirror the current Node/Vercel implementation (in-app scraper, `lib/fallback-schedule.json`, `list_courses`/`get_course_details`/`get_center_info` tools) instead of the retired `vipassana-course-discovery-mcp` server.
- **Docs/agent migration**: replace `CLAUDE.md` with `AGENTS.md` as the canonical project instructions file (rewritten for the Node/Vercel project and opencode). **BREAKING** for Claude Code users: `CLAUDE.md` and the `.claude/` directory (permissions + duplicated `opsx` commands/skills) are removed — the openspec workflow mirrors live only under `.opencode/` and `.agent/`.

## Capabilities

### New Capabilities
- `intent-routing`: classify whether a user request can be answered from the static knowledge base or requires live course data, in English and Vietnamese.

### Modified Capabilities
- `chatbot-agent`: knowledge-only questions SHALL be served via a fast path (single LLM call, no tools, trimmed knowledge context); mechanism references updated to the Node implementation.
- `project-hygiene`: `AGENTS.md` becomes the canonical instructions file; legacy `CLAUDE.md` and Claude Code-specific config are removed from the repo.

## Impact

- **Code**: `api/chat.js` (routing + fast path), new `api/router.js`, new `api/sections.js`, `api/tools/list-courses.js` (parallel + dedup), `api/scraper/cache.js` (optional in-flight dedup), `api/knowledge.js` (section parse).
- **Tests**: new `tests/router.test.mjs`, `tests/sections.test.mjs`; existing `tests/*` must remain green.
- **Docs**: `AGENTS.md` (new), `CLAUDE.md` (deleted), `.claude/` (deleted), `README.md` (pointer), `openspec/specs/chatbot-agent/spec.md` (rewrite), `openspec/specs/project-hygiene/spec.md` (delta).
- **Contracts**: unchanged — the public surface stays `POST /api/chat → { text }` with the same `sanitize_urls()` backstop. No new dependencies.
