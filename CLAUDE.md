# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A bilingual (Vietnamese/English) chatbot agent that answers questions about Vipassana meditation courses run by UCENLIST at two centers in Vietnam (Dhamma Virocana in Hà Nội, Dhamma Vutthi in HCMC). It combines a static knowledge base (embedded skill doc) with live course-schedule lookups via a companion MCP server, and enforces strict output safety (domain gating, human-in-the-loop registration).

The repo has two independently-packaged Python projects:

- **`chatbot_agent/`** (package `vipassana-ucenlist-agent`) — the Google ADK agent itself.
- **`vipassana-course-discovery-mcp/`** (package `vipassana-mcp`) — a standalone MCP server the agent connects to over stdio for live course data. It is a separate `pyproject.toml`/build and is meant to be installed independently, then invoked by the agent as the `vipassana-mcp` CLI command.

## Commands

Both projects use `uv`/`pip` with `pyproject.toml` (hatchling). There is one shared root `.venv`.

```bash
# Install the agent (from repo root)
uv pip install -e .

# Install the MCP server (separate package, sibling directory)
cd vipassana-course-discovery-mcp && pip install -e . && cd ..

# Set up credentials
cp chatbot_agent/.env.example chatbot_agent/.env
# edit chatbot_agent/.env and set GOOGLE_API_KEY (optional: AGENT_MODEL, default gemini-2.0-flash)

# Run the interactive CLI chatbot
python -m chatbot_agent.cli_chatbot_agent

# Run the agent's evaluation suite (no live LLM calls — tests sanitize_urls() and
# static assertions against the system prompt string)
python chatbot_agent/eval_agent.py

# Smoke-test the MCP server directly
cd vipassana-course-discovery-mcp && python smoke_test.py
```

Note: the root README describes an older layout (`chatbot-agent/` dir, `chatbot_agent.py`, `python chatbot_agent.py`). The actual current layout is the `chatbot_agent/` package with `cli_chatbot_agent.py` as the implementation module — treat the commands above as authoritative over the README.

There is no linter/formatter or test framework (pytest, etc.) configured in either `pyproject.toml` — `eval_agent.py` and `smoke_test.py` are plain scripts, run directly with `python`.

## Architecture

### Agent (`chatbot_agent/`)

- `cli_chatbot_agent.py` is where everything lives:
  - `KNOWLEDGE_SYSTEM_PROMPT` — the base system prompt template (identity, bilingual rules, security rules, registration handoff, fallback-warning rules). Has a `{knowledge_base}` placeholder.
  - `load_knowledge_base()` — reads `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md` from disk at agent-creation time and injects it into `{knowledge_base}`. This is how the static knowledge base actually reaches the model — it's not duplicated into the Python source. If you edit the knowledge content, edit that SKILL.md, not the prompt string.
  - `create_mcp_toolset()` — wires up `McpToolset`/`StdioConnectionParams` to spawn the `vipassana-mcp` command as a subprocess and expose its tools to the agent.
  - `create_agent()` — builds the `google.adk.agents.Agent` with model/instruction/tools.
  - `sanitize_urls()` / `TRUSTED_DOMAINS` — a regex-based post-processing safety net that strips any URL not matching `ucenlist.org` or `*.vridhamma.org` from agent output, independent of and in addition to the system-prompt instruction telling the model to do the same thing. This dual-layer ("prompt says don't + code enforces it") is intentional — treat both layers as required when touching domain-gating logic.
  - `main()` — interactive stdio chat loop using ADK's `Runner` + `InMemorySessionService`; every response passes through `sanitize_urls()` before being printed.
- `agent.py` and `__init__.py` both just re-export `create_agent()`/`root_agent` from `cli_chatbot_agent.py` — these are ADK integration entry points, not separate logic.
- `eval_agent.py` is a static/string-based eval script (no live model calls): it asserts things like "the system prompt contains `language=\"vi\"`" or "sanitize_urls strips this untrusted URL". When changing the system prompt wording, check this file for exact substrings it greps for (e.g. `"NEVER fill out"`, `"Please click the link"`, `⚠️`) — renaming phrases can silently break these evals.

### MCP server (`vipassana-course-discovery-mcp/`)

- `vipassana_mcp/server.py` — `FastMCP` app named `vipassana-course-discovery`; registers three tools and runs over stdio via the `vipassana-mcp` console-script entry point.
- `vipassana_mcp/tools/` — one module per tool (`list_courses`, `get_course_details`, `get_center_info`); `get_center_info` is pure static data (no network).
- `vipassana_mcp/scraper/vri_schedule.py` — scrapes `schedule.vridhamma.org` (Drupal 9, no public API) with BeautifulSoup/lxml.
- `vipassana_mcp/scraper/cache.py` — in-memory cache layer.
- `vipassana_mcp/data/schedule_fallback.json` — static fallback course data used when scraping fails.
- **Data-freshness fallback chain**: live scrape → 10-min in-memory cache → stale cache (up to 24h) → `schedule_fallback.json`. Every course record carries a `data_freshness` field (`"live"` / `"cached"` / `"fallback"`); the agent's system prompt requires surfacing a `⚠️` warning to the user whenever `data_freshness == "fallback"`, since dates in that file are approximate.
- If the scraper detects empty rows (JS-rendered table), it's expected to fall back rather than error — Playwright support is documented but not implemented/bundled.

### Knowledge skill (`.agents/skills/vipassana-ucenlist-knowledge/SKILL.md`)

This file is not a Claude Code skill in the usual sense — it's read directly off disk by `load_knowledge_base()` at agent startup and concatenated into the system prompt. It is the single source of truth for static content (Vipassana background, S.N. Goenka, Code of Discipline, daily timetable, center details). Update it in place; there's no other copy to keep in sync.

## Spec-driven workflow (OpenSpec)

This repo uses the `openspec` CLI for spec-driven change management, with the workflow definitions duplicated across agent tooling: `.agent/workflows/` + `.agent/skills/` (generic), `.opencode/` (OpenCode), and `.claude/` (Claude Code — `.claude/commands/opsx/{propose,explore,apply,archive}.md` as slash commands `/opsx:propose` etc., plus matching `.claude/skills/openspec-*`). All three mirror the same four steps: propose → explore → apply → archive. Specs live in `openspec/specs/<capability>/spec.md` (currently `chatbot-agent`, `course-discovery`, `ucenlist-knowledge`); completed change proposals are archived under `openspec/changes/archive/<date>-<name>/` with `proposal.md`, `design.md`, `tasks.md`. When making a non-trivial behavioral change, check `openspec/specs/` first — it documents intended requirements/scenarios (e.g. domain gating, fallback warning, bilingual routing) that the code and evals are expected to satisfy.

## Security model (do not weaken without explicit request)

1. **Safe Domain Gating**: only `ucenlist.org` and `*.vridhamma.org` URLs may ever reach the user — enforced both in the system prompt and programmatically via `sanitize_urls()`/`TRUSTED_DOMAINS` in `cli_chatbot_agent.py`.
2. **Human-in-the-loop registration**: the agent must never submit registration forms or handle personal data — it only ever hands the user an `apply_url` and tells them to click it themselves.
3. **Prompt injection defense**: the system prompt explicitly instructs the model to refuse externally-supplied URLs claiming to be official; `sanitize_urls()` is the backstop if the model is fooled anyway.
