# Vipassana Assistant

**Subtitle:** A bilingual AI assistant that helps meditators discover and register for Vipassana courses at UCENLIST centers — safely, accurately, and compassionately.

---

## The Problem

[UCENLIST](https://ucenlist.org) (UNESCO Center for Life Skills Training) is a small non-profit in Vietnam that organizes free 10-day Vipassana meditation courses following the S.N. Goenka tradition. They serve both Vietnamese and English-speaking seekers through two centers: **Dhamma Virocana** (Hà Nội) and **Dhamma Vutthi** (HCMC).

The problem: their website is informational, not interactive. Users must manually navigate between the main site for course details and `schedule.vridhamma.org` (VRI's external scheduling system) for live dates and registration links — often in a language they're not comfortable with, with no guided support.

There was no conversational assistant to bridge that gap.

---

## What I Built

A **bilingual (Vietnamese/English) AI chatbot agent** that answers questions about Vipassana meditation and UCENLIST, then fetches live course schedules and guides users to register — all without automating sensitive personal actions. It is a serverless Node.js app with a single `POST /api/chat` endpoint; the browser UI owns the conversation history.

### Architecture

```text
public/index.html                 ← static bilingual chat UI (dark theme, zero build step)
        │  POST /api/chat  { messages, conversationId }  →  { text }
        ▼
api/chat.js                       ← single stateless endpoint (Vercel serverless function)
  ├─ withLogContext()             ← structured JSON-line logging (requestId / conversationId)
  ├─ out-of-scope gate            ← deterministic "meditation group/club" fallback, no LLM
  ├─ classifyIntent()             ← lib/router.js: keyword tables → BM25 → tiny LLM classifier
  │     ├─ "kb"    → fast path    ← quick-answers (deterministic, <100ms, no LLM)
  │     │                         → answer-cache (in-memory TTL, repeated questions)
  │     │                         → one LLM call, trimmed knowledge sections (lib/sections.js)
  │     └─ "tools" → live data    ← schedule-answers (deterministic windowed schedule, no LLM)
  │                               → quick-fallback (BM25 center-info answer)
  │                               → single-call composer: pre-fetched live schedule
  │                                 context + full knowledge base (lib/llm.js → Gemini)
  └─ sanitize_urls()              ← Safe Domain Gating backstop on every path
```

All LLM calls go through `lib/llm.js` — a thin OpenAI-compatible chat-completions client against Google Gemini (`gemini-3.1-flash-lite`, `GEMINI_API_KEY`) with 429 exponential backoff and a hard wall-clock budget.

**Knowledge path (`kb`)** — the deterministic first three layers answer most questions with **no LLM call at all**: structured center/FAQ answers from `lib/quick-answers.js` (intent detected by BM25 over exemplar documents), then a 24-hour in-memory answer cache. Only the fall-through does a single LLM call with a trimmed prompt (the relevant SKILL.md sections only) and **no tools attached**.

**Live-data path (`tools`)** — a windowed schedule query ("lịch thiền cuối tháng này", "courses next month") is matched deterministically by `lib/schedule-answers.js`, which calls `list_courses` once and renders a bilingual markdown answer with **no LLM call**. Anything else falls through to a single-call composer that pre-fetches the live schedule context and the full knowledge base into the prompt (no function-calling loop).

### The tools

The `lib/tools/` modules are a zod-validated tool set:

- `list_courses(center, language, course_type)` — scrapes `schedule.vridhamma.org` (and special announcements from `ucenlist.org/course-schedule`), returning courses with dates, status, and `apply_url`
- `get_course_details(apply_url)` — fetches eligibility and special instructions for a specific course
- `get_center_info(center)` — static contact/location info, always available offline

---

## Course Concepts Demonstrated

| Concept | How It's Used |
| --- | --- |
| **Agent pattern** | Bilingual intent router + single-call composer; deterministic fast paths answer most queries with no LLM |
| **Live-data integration** | `list_courses` scrapes VRI's schedule; deterministic renderer for windowed queries |
| **Agent Skills** | `vipassana-ucenlist-knowledge` skill embedded as system prompt, sectioned by BM25 for the fast path |
| **Security / Safe Domain Gating** | Dual-layer URL filtering (system prompt + `sanitize_urls()` post-processor) |
| **Human-in-the-loop** | Agent provides `apply_url` but always delegates form completion to the user |
| **Fallback strategy** | Live scrape → 10-min cache → 24h stale cache → `fallback-schedule.json` |
| **Observability** | Structured JSON-line logs with per-request correlation IDs; full user messages and answers are never logged |

---

## Security Design

The agent serves a community that is particularly vulnerable to phishing — seekers looking for a retreat may not scrutinize URLs. I implemented a **dual-layer Safe Domain Gating** approach:

1. **System prompt instruction** — the LLM is explicitly told it must never output URLs outside `ucenlist.org` or `*.vridhamma.org`, with a worked example of a prompt injection to refuse.
2. **`sanitize_urls()` post-processor** (`lib/sanitize.js`) — a programmatic "Blue Team" backstop that strips any URL not on the trusted-domain allowlist from every agent response, on every path, before it is displayed to the user.

This means even if the model hallucinates a phishing link or a prompt injection succeeds, the output layer catches and redacts it. Registration stays human-in-the-loop: the agent hands over the official `apply_url` and instructs the user to complete the form themselves — it never submits forms or handles personal data.

---

## Evaluation

The project ships a test suite run with `node --test tests/*` (15 files) plus ESLint, both enforced in CI on every pull request. Coverage includes:

| Test file | What it checks |
| --- | --- |
| `sanitize` | Trusted URLs pass; untrusted URLs are stripped |
| `router` / `retrieval` | Bilingual intent routing (`kb` vs `tools`), language detection, BM25 classification margins |
| `sections` | Fast-path prompt trimming to relevant knowledge sections |
| `quick-answers` | Deterministic center/FAQ answers (no LLM), `language="vi"` / `language="en"` |
| `schedule-answers` | Windowed schedule queries ("this month", "next week") render correct dates/status |
| `chat-path` | End-to-end request flow: sanitization, fallback warning, human-in-the-loop phrasing |
| `markdown`, `log`, `answer-cache`, `vri-schedule`, `ucenlist-schedule`, `llm` | Renderer escaping, structured logging, cache TTL, scraper parsing, LLM retry/backoff |

Key invariants are pinned byte-for-byte in the tests: the system prompt's `language="vi"` / `language="en"` routing, the `⚠️` fallback warning when `data_freshness = "fallback"`, "NEVER fill out" phrasing, and the trusted-domain regex.

---

## Tech Stack

- **Node.js ≥ 20** (ESM) — serverless functions on Vercel (region `sin1`, 60s budget)
- **Model:** Google Gemini `gemini-3.1-flash-lite` via OpenAI-compatible chat-completions (configurable via `AGENT_MODEL`; free AI Studio tier, no credit card)
- **Scraping:** `cheerio` (VRI Drupal Views tables + UCENLIST Odoo announcements)
- **Retrieval:** `wink-bm25-text-search` — bilingual diacritic-insensitive BM25 over knowledge sections and live-data exemplars
- **Validation:** `zod` for tool input schemas
- **Frontend:** zero-dependency static HTML + custom markdown renderer, no build step
- **CI/CD:** GitHub Actions (test + lint) gating Vercel production deploys

---

## Impact

UCENLIST runs on volunteer effort. This agent reduces the information-access friction for new and returning meditators, automating the repetitive Q&A burden while keeping human judgment in the loop for the parts that matter — the registration decision itself.

The same pattern (knowledge skill + live-data scraper + bilingual routing + domain gating) is reusable for any small non-profit that has a static website, an external scheduling system, and a multilingual audience.

---

## Repository

<https://github.com/LiberiFatali/vipassana-assistant>
