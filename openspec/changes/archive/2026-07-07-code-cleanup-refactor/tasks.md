## 1. Remove dead code and untrack generated artifacts

- [x] 1.1 Delete `chatbot_agent/main.py` (unreferenced stub, no `pyproject.toml` script or importer)
- [x] 1.2 Remove `CENTER_ALIASES` and `resolve_center()` from `vipassana-course-discovery-mcp/vipassana_mcp/data/centers.py`
- [x] 1.3 Run `git rm --cached chatbot_agent/.adk/session.db` to untrack the ADK-generated session DB
- [x] 1.4 Add `.adk/` to `.gitignore`

## 2. Fix outdated documentation

- [x] 2.1 Update `README.md` Setup/Running sections to reference `chatbot_agent/` (not `chatbot-agent/`), `cli_chatbot_agent.py`, and `python -m chatbot_agent.cli_chatbot_agent`
- [x] 2.2 Update `README.md` Architecture diagram/section if it still lists `chatbot_agent.py` as the file name

## 3. Deduplicate scraper HTTP-fetch logic

- [x] 3.1 Add `fetch_html(url: str) -> str` to `vipassana_mcp/scraper/vri_schedule.py`, wrapping the existing `httpx.AsyncClient` GET + `raise_for_status()` + exception-to-`ScraperError` mapping currently inlined in `fetch_courses()`
- [x] 3.2 Update `fetch_courses()` to call `fetch_html()` instead of inlining the request
- [x] 3.3 Update `get_course_details.py` to call `fetch_html()` (catching `ScraperError`) instead of duplicating its own `httpx.AsyncClient`/try-except block, preserving its existing `{"apply_url": ..., "error": ...}` response shape

## 4. Fix duplicate Agent construction

- [x] 4.1 Change `chatbot_agent/__init__.py` to re-export `TRUSTED_DOMAINS`, `sanitize_urls`, `KNOWLEDGE_SYSTEM_PROMPT`, `create_agent`, and `load_knowledge_base` from `cli_chatbot_agent` without calling `create_agent()`
- [x] 4.2 Confirm `chatbot_agent/agent.py` remains the sole place that calls `create_agent()` to build `root_agent`
- [x] 4.3 Grep the repo for any other usage of `chatbot_agent.root_agent` (top-level) to confirm nothing else depends on `__init__.py` constructing it directly

## 5. Verify no regressions

- [x] 5.1 Run `python chatbot_agent/eval_agent.py` — confirm all evals still pass and it no longer requires ADK/MCP construction to import
- [x] 5.2 Run `python vipassana-course-discovery-mcp/smoke_test.py` — confirm it still passes end-to-end
- [x] 5.3 Run `python -m chatbot_agent.cli_chatbot_agent` manually and confirm the interactive chat loop still starts and responds normally
- [x] 5.4 Run `git status` to confirm `chatbot_agent/.adk/session.db` no longer reappears as untracked/tracked after a local run
