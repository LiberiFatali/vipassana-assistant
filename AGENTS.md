# AGENTS.md

This file provides guidance to agent tools (opencode and others) when working with code in this repository.

## What this is

A bilingual (Vietnamese/English) chatbot agent that answers questions about Vipassana meditation courses run by UCENLIST at two centers in Vietnam (Dhamma Virocana in Hà Nội, Dhamma Vutthi in TP. HCM). It combines a static knowledge base (embedded skill doc) with live course-schedule lookups via a companion scraper, and enforces strict output safety (domain gating, human-in-the-loop registration).

The project is a Node.js serverless app deployed on Vercel. The public surface is a single endpoint `POST /api/chat → { text }` (non-streaming; the client owns the conversation history). LLM access uses OpenCode Zen (OpenAI-compatible chat-completions).

## Commands

```bash
npm install

# Set up credentials
#   OPENCODE_API_KEY — required (OpenCode Zen API key, https://opencode.ai/auth)
#   AGENT_MODEL      — optional (default deepseek-v4-flash-free)
#   FAST_MODEL       — optional, fast-path only (default mimo-v2.5-free)
# For local dev, create a .env file (see README).

npm run dev        # node --env-file=.env server.js → http://localhost:3000
npm test           # node --test tests/*
vercel dev         # alternative local server (Vercel CLI)
vercel deploy --prod
```

Spec-driven change workflow uses the `openspec` CLI (see below).

## Architecture

```
public/index.html        # single static chat UI (bilingual, dark theme, no build step)
public/markdown.js       # zero-dependency markdown renderer (escape-first, trusted-domain-gated links)
server.js                # local dev server — static public/ + routes POST /api/chat
api/chat.js              # POST /api/chat — intent router → fast path or tool loop → sanitized { text }
api/router.js            # bilingual (EN/VI) intent router: knowledge-only vs live-data (+ tiny LLM fallback)
api/quick-answers.js     # deterministic no-LLM answers (center info, Vipassana definition) for the fast path
api/answer-cache.js      # in-memory TTL cache for repeated fast-path answers
api/sections.js          # SKILL.md sectioning + fast-path prompt builder (trimmed knowledge context)
api/knowledge.js         # loads SKILL.md from disk, module-cached
api/system-prompt.js     # KNOWLEDGE_SYSTEM_PROMPT template ({knowledge_base} placeholder)
api/sanitize.js          # TRUSTED_DOMAINS + sanitize_urls() — Safe Domain Gating backstop
api/tools/               # list_courses, get_course_details, get_center_info (registry + zod parse)
api/scraper/             # vri-schedule.js (fetch + cheerio), cache.js (TTL + fallback chain)
lib/centers.js           # static center info
lib/fallback-schedule.json  # static fallback schedule data
tests/                   # node:test suites (sanitize, markdown, router, sections, chat-path, quick-answers, answer-cache)
vercel.json              # function maxDuration + region (sin1)
```

### Request flow (relevant to latency work)

`api/chat.js` classifies the latest user message with `api/router.js`:

- **Knowledge-only (`kb`)** → fast path, in this order: (1) deterministic structured answers via `api/quick-answers.js` (center address/phone/email/website from `lib/centers.js`, curated bilingual Vipassana definition) with **no LLM call**; (2) the in-memory answer cache (`api/answer-cache.js`, keyed by `lang|normalized question`) for repeated questions; (3) a single LLM call with a trimmed system prompt (only the relevant SKILL.md sections via `api/sections.js`), **no tools attached**, using `FAST_MODEL` (falling back to `AGENT_MODEL` once on failure). Every fast-path output then passes through `sanitize_urls()`.
- **Live-data (`tools`)** → tool loop (up to 5 steps) with the full knowledge base and the full tool registry. `list_courses` scrapes `schedule.vridhamma.org` (parallel across centers for `center="all"`, in-flight dedup) with a live → cached → fallback chain; every record carries `data_freshness` (`"live"` / `"cached"` / `"fallback"`).

Do not break these invariants: the fast path must never attach tools, the final text of every path must pass through `sanitize_urls()`, and the tool path must keep the full knowledge base.

### Data-freshness fallback chain

Live scrape → 10-min in-memory cache → stale cache (up to 24h) → `lib/fallback-schedule.json`. The system prompt requires surfacing a `⚠️` warning whenever `data_freshness == "fallback"`. The in-memory cache is per-function-instance; Vercel cold starts re-scrape.

## Knowledge skill

`.agents/skills/vipassana-ucenlist-knowledge/SKILL.md` is the single source of truth for static content (Vipassana background, S.N. Goenka, Code of Discipline, daily timetable, center details, FAQs). It is read off disk at request time and injected into the prompt. Edit it in place — there is no other copy to keep in sync.

## Security model (do not weaken without explicit request)

1. **Safe Domain Gating**: only `ucenlist.org` and `*.vridhamma.org` URLs may ever reach the user — enforced both in the system prompt and programmatically via `sanitize_urls()`/`TRUSTED_DOMAINS` in `api/sanitize.js`. This dual-layer ("prompt says don't + code enforces it") is intentional — treat both layers as required when touching domain-gating logic. The fast path still passes through `sanitize_urls()`.
2. **Human-in-the-loop registration**: the agent must never submit registration forms or handle personal data — it only ever hands the user an `apply_url` and tells them to click it themselves.
3. **Prompt injection defense**: the system prompt explicitly instructs the model to refuse externally-supplied URLs claiming to be official; `sanitize_urls()` is the backstop if the model is fooled anyway.

## Spec-driven workflow (OpenSpec)

This repo uses the `openspec` CLI for spec-driven change management. The workflow definitions are duplicated across agent tooling: `.opencode/` (opencode commands `/opsx-propose`, `/opsx-explore`, `/opsx-apply`, `/opsx-archive` + matching skills) and `.agent/` (generic mirror). Specs live in `openspec/specs/<capability>/spec.md` (chatbot-agent, course-discovery, intent-routing, project-hygiene, ucenlist-knowledge, etc.); change proposals are scaffolded under `openspec/changes/` and archived under `openspec/changes/archive/`. When making a non-trivial behavioral change, check `openspec/specs/` first — it documents the intended requirements/scenarios that code and evals are expected to satisfy.

## Eval caveat

The test suites grep exact substrings out of `KNOWLEDGE_SYSTEM_PROMPT` (`api/system-prompt.js`) and the router/sections modules — e.g. `language="vi"`, `language="en"`, `⚠️`, "NEVER fill out", "Please click the link". Renaming these phrases, or changing the static prompt string, can silently break `tests/*`. Keep the static prompt string byte-for-byte unchanged unless you update the tests deliberately.
