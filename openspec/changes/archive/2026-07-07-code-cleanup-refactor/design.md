## Context

`chatbot_agent/__init__.py` and `chatbot_agent/agent.py` each independently call `create_agent()`:

```python
# __init__.py
from .cli_chatbot_agent import TRUSTED_DOMAINS, sanitize_urls, KNOWLEDGE_SYSTEM_PROMPT, create_agent
root_agent = create_agent()

# agent.py
from chatbot_agent.cli_chatbot_agent import create_agent
root_agent = create_agent()
```

Since Python always runs a package's `__init__.py` before any submodule, simply doing `import chatbot_agent` (e.g. from `eval_agent.py`, which only wants `sanitize_urls`/`TRUSTED_DOMAINS`) already builds a full `google.adk.agents.Agent` plus an `McpToolset`/`StdioConnectionParams` config. If `chatbot_agent.agent` is *also* imported (the ADK convention — ADK's CLI loads `<package>/agent.py:root_agent`), a second, independent `Agent`/`McpToolset` gets built. Neither instance is ever torn down or reused by the other.

This matters for the cleanup because it's the reason `eval_agent.py` can't be a lightweight static-assertion script: importing `chatbot_agent` to reach two module-level constants drags in the entire ADK/MCP wiring.

## Goals / Non-Goals

**Goals:**
- Make `import chatbot_agent` (or `chatbot_agent.cli_chatbot_agent`) side-effect-free with respect to ADK/MCP construction — no `Agent`/`McpToolset` built just to read a prompt string or call `sanitize_urls`.
- Keep exactly one place that constructs `root_agent`, so `adk run`/`adk web` (which load `chatbot_agent/agent.py:root_agent`) keep working unchanged.
- Preserve all currently-passing behavior: `eval_agent.py` evals, `smoke_test.py`, and the interactive CLI (`python -m chatbot_agent.cli_chatbot_agent`).

**Non-Goals:**
- No change to the system prompt content, tool behavior, or ADK/MCP wiring semantics.
- No test framework introduced (repo has none; out of scope for a cleanup change).
- No behavior change to `data_freshness` fallback logic, date parsing, or scraping strategy.

## Decisions

1. **Stop constructing `root_agent` in `chatbot_agent/__init__.py`.**
   `__init__.py` will re-export the pure symbols (`TRUSTED_DOMAINS`, `sanitize_urls`, `KNOWLEDGE_SYSTEM_PROMPT`, `create_agent`, `load_knowledge_base`) directly from `cli_chatbot_agent` without calling `create_agent()`. The sole `root_agent = create_agent()` call stays in `agent.py`, which is the module ADK's tooling actually loads.
   - *Alternative considered*: keep `__init__.py`'s eager construction and have `eval_agent.py` import from `chatbot_agent.cli_chatbot_agent` directly instead. Rejected because Python still executes `chatbot_agent/__init__.py` first when importing any submodule — the side effect can't be avoided from the caller's side; it has to be removed at the source.

2. **Extract a shared HTTP-fetch helper in the scraper module** rather than a new file.
   Add `fetch_html(url: str) -> str` to `vri_schedule.py` (co-located with `HEADERS`/`REQUEST_TIMEOUT`, which it already owns) wrapping the `httpx.AsyncClient(...).get(url)` + `raise_for_status()` + exception-to-`ScraperError` mapping that `fetch_courses()` currently inlines. `get_course_details.py` (which already imports `HEADERS`/`REQUEST_TIMEOUT` from this module) calls `fetch_html()` and catches `ScraperError` to build its `{"error": ...}` response shape, instead of duplicating the `httpx.AsyncClient`/try-except block.
   - *Alternative considered*: a new `scraper/http.py` module. Rejected as unnecessary indirection for one ~15-line helper with a single existing owner module.

3. **Delete rather than deprecate.** `chatbot_agent/main.py` and `CENTER_ALIASES`/`resolve_center()` have zero callers (verified via repo-wide grep) and are not part of any documented public interface, so they're deleted outright rather than kept behind a compatibility shim.

4. **Untrack `chatbot_agent/.adk/session.db` and gitignore `.adk/`** rather than just deleting the file once. It's a SQLite session-history DB that ADK regenerates locally on every `adk run`/`adk web`/CLI session — it will keep reappearing without the gitignore rule.

## Risks / Trade-offs

- [Risk] Moving `root_agent` construction fully into `agent.py` could break an external ADK loader that expects `chatbot_agent.root_agent` at the top-level package. → Mitigation: repo-wide grep found no such reference; ADK's own convention (per its sample agents) is `<package>/agent.py:root_agent`, which this change preserves exactly.
- [Risk] Extracting `fetch_html()` could subtly change error messages relied on by `smoke_test.py` warnings. → Mitigation: keep `ScraperError` message format identical; run `smoke_test.py` after the change.
- [Risk] Deleting `CENTER_ALIASES`/`resolve_center()` removes functionality that looked like it was meant to power future natural-language center resolution. → Mitigation: it's untested, unwired dead code today; if needed later it can be reintroduced when an actual caller exists (e.g. wired into `get_center_info`'s `center` argument).

## Migration Plan

1. Remove dead code (`main.py`, `CENTER_ALIASES`/`resolve_center`).
2. Untrack `chatbot_agent/.adk/session.db`, add `.adk/` to `.gitignore`.
3. Fix `README.md` paths/commands.
4. Extract `fetch_html()` in `vri_schedule.py`; update `get_course_details.py` to use it.
5. Fix the `__init__.py`/`agent.py` duplicate-construction issue.
6. Run `python chatbot_agent/eval_agent.py` and `python vipassana-course-discovery-mcp/smoke_test.py` to confirm no regressions.

No rollback complexity — every step is independently revertible via git, and no runtime data or external state is touched.

## Open Questions

None — scope and approach were confirmed with the user before writing this design (whole-repo cleanup, implementation-only, no behavior changes).
