## Why

A review of both packages (`chatbot_agent/` and `vipassana-course-discovery-mcp/`) turned up dead code, a runtime artifact accidentally committed to git, outdated setup docs, duplicated HTTP-fetch logic, and an import-time side effect that couples a pure-logic eval script to full ADK agent construction. None of this changes external behavior, but it makes the code harder to read, test, and trust — worth cleaning up before the codebase grows further.

## What Changes

- Remove `chatbot_agent/main.py` — an unreferenced stub (`print("Hello from chatbot-agent!")`) left over from project scaffolding; not wired into `pyproject.toml` scripts or imported anywhere.
- Remove `CENTER_ALIASES` and `resolve_center()` from `vipassana_mcp/data/centers.py` — dead code with no callers anywhere in either package.
- Remove `chatbot_agent/.adk/session.db` from git (a SQLite session DB generated at runtime by ADK) and add `.adk/` to `.gitignore` so it can't be re-committed.
- Update `README.md` to match the actual current layout (`chatbot_agent/` package, `cli_chatbot_agent.py`, `python -m chatbot_agent.cli_chatbot_agent`) instead of the stale `chatbot-agent/` directory and `python chatbot_agent.py` instructions.
- Extract a shared "fetch URL with standard headers/timeout/error-mapping" helper in the scraper module, used by both `vri_schedule.fetch_courses()` and `get_course_details.get_course_details()`, which currently duplicate the same `httpx.AsyncClient` setup and near-identical `try`/`except httpx.*` blocks.
- Decouple the pure, testable pieces of `chatbot_agent` (`sanitize_urls`, `TRUSTED_DOMAINS`, `KNOWLEDGE_SYSTEM_PROMPT`) from the package `__init__.py`'s import-time side effect (`root_agent = create_agent()`), so that `eval_agent.py` — a static script that never makes a live model call — no longer has to construct a full ADK `Agent` + `McpToolset` just to test string/regex logic.

## Capabilities

### New Capabilities

- `project-hygiene`: internal codebase-quality requirements (no committed runtime artifacts, no dead code, single agent-construction path, docs matching actual layout) that this change makes the codebase satisfy. These are maintainability requirements, not user-facing behavior.

### Modified Capabilities

_None — no existing spec-level requirement changes. Behavior of `sanitize_urls`, `list_courses`, `get_course_details`, `get_center_info`, and the CLI chat loop is preserved exactly; only internal structure changes._

## Impact

- **Affected code**: `chatbot_agent/main.py` (deleted), `chatbot_agent/__init__.py`, `chatbot_agent/cli_chatbot_agent.py`, `chatbot_agent/eval_agent.py`, `vipassana-course-discovery-mcp/vipassana_mcp/data/centers.py`, `vipassana-course-discovery-mcp/vipassana_mcp/scraper/vri_schedule.py`, `vipassana-course-discovery-mcp/vipassana_mcp/tools/get_course_details.py`.
- **Affected docs/config**: `README.md`, `.gitignore`.
- **Removed from git tracking**: `chatbot_agent/.adk/session.db`.
- **No dependency changes, no API/tool signature changes, no CLI command changes.**
- **Verification**: `python chatbot_agent/eval_agent.py` must still report all evals passing; `python vipassana-course-discovery-mcp/smoke_test.py` must still pass end-to-end.
