# Vipassana UCENLIST Chatbot Agent

**Track:** Agents for Good

**Subtitle:** A bilingual AI assistant that helps Vietnamese meditators discover and register for Vipassana courses at UCENLIST centers — safely, accurately, and compassionately.

---

## The Problem

[UCENLIST](https://ucenlist.org) (UNESCO Center for Life Skills Training) is a small non-profit in Vietnam that organizes free 10-day Vipassana meditation courses following the S.N. Goenka tradition. They serve both Vietnamese and English-speaking seekers through two centers: **Dhamma Virocana** (Hà Nội) and **Dhamma Vutthi** (HCMC).

The problem: their website is informational, not interactive. Users must manually navigate between the main site for course details and `schedule.vridhamma.org` (VRI's external scheduling system) for live dates and registration links — often in a language they're not comfortable with, with no guided support.

There was no conversational assistant to bridge that gap.

---

## What I Built

A **bilingual (Vietnamese/English) AI chatbot agent** that answers questions about Vipassana meditation and UCENLIST, then fetches live course schedules and guides users to register — all without automating sensitive personal actions.

### Architecture

```
chatbot_agent (Google ADK)
├── KNOWLEDGE_SYSTEM_PROMPT   ← vipassana-ucenlist-knowledge skill (embedded)
├── McpToolset                ← vipassana-course-discovery-mcp via stdio
├── sanitize_urls()           ← Safe Domain Gating post-processor
└── Runner (InMemorySession)  ← Interactive CLI session loop
```

The system is composed of two independently deployable packages:

**1. `vipassana-course-discovery-mcp`** — A custom MCP server that scrapes `schedule.vridhamma.org` and exposes three tools:
- `list_courses(center, language, course_type)` — returns upcoming courses with dates, status, and `apply_url`
- `get_course_details(apply_url)` — fetches eligibility and special instructions for a specific course
- `get_center_info(center)` — static contact/location info, always available offline

**2. `vipassana-ucenlist-agent`** — A Google ADK agent that:
- Embeds a comprehensive knowledge skill (Vipassana philosophy, S.N. Goenka biography, Code of Discipline, daily timetable, FAQs in both Vietnamese and English)
- Connects to the MCP server via `StdioConnectionParams`
- Detects the user's language and routes queries appropriately
- Applies a two-layer security filter before any response is shown

---

## Course Concepts Demonstrated

| Concept | How It's Used |
|---|---|
| **Google ADK** | `Agent`, `Runner`, `InMemorySessionService` for the chatbot |
| **MCP Server** | Custom `vipassana-course-discovery-mcp` with three tools |
| **Agent Skills** | `vipassana-ucenlist-knowledge` skill embedded as system prompt |
| **Security / Safe Domain Gating** | Two-layer URL filtering (system prompt + `sanitize_urls()` post-processor) |
| **Human-in-the-loop** | Agent provides `apply_url` but always delegates form completion to the user |
| **Fallback strategy** | MCP server degrades gracefully: live scrape → 10min cache → 24h stale cache → fallback JSON |

---

## Security Design

The agent serves a community that is particularly vulnerable to phishing — seekers looking for a retreat may not scrutinize URLs. I implemented a **dual-layer Safe Domain Gating** approach:

1. **System prompt instruction** — the LLM is explicitly told it must never output URLs outside `ucenlist.org` or `*.vridhamma.org`, with a worked example of a prompt injection to refuse.
2. **`sanitize_urls()` post-processor** — a regex-based "Blue Team" check that programmatically strips any untrusted URL from every agent response before it is displayed to the user.

This means even if the model hallucinates a phishing link or a prompt injection succeeds, the output layer catches and redacts it.

---

## Evaluation

The project ships with `eval_agent.py` covering 5 test scenarios:

| Test | What it checks |
|---|---|
| Domain gating | Trusted URLs pass; untrusted URLs are stripped |
| Bilingual routing | System prompt correctly specifies `language="vi"` / `language="en"` |
| Fallback warning | Agent includes ⚠️ notice when `data_freshness="fallback"` |
| Human-in-the-loop | Agent never automates registration; delegates to user |
| Prompt injection defense | Injected untrusted URL is stripped by `sanitize_urls()` |

All 5 evaluations pass.

---

## Tech Stack

- **Python 3.13** — `google-adk >= 2.3.0`, `mcp[cli] >= 1.28.1`, `python-dotenv`
- **Model:** `gemini-2.0-flash` (configurable via `AGENT_MODEL` env var)
- **MCP transport:** stdio (standard for ADK `MCPToolset`)
- **Scraping:** `httpx` + `BeautifulSoup4`, with optional Playwright for JS-rendered pages
- **Package manager:** `uv`

---

## Impact

UCENLIST runs on volunteer effort. This agent reduces the information-access friction for Vietnamese meditators who may speak limited English, automating the repetitive Q&A burden while keeping human judgment in the loop for the parts that matter — the registration decision itself.

The same pattern (knowledge skill + live-data MCP server + bilingual routing + domain gating) is reusable for any small non-profit that has a static website, an external scheduling system, and a multilingual audience.

---

## Repository

[TBA](TBA)

---

*Built with Google ADK, MCP, and Gemini — as part of the 5-Day AI Agents Intensive.*
