# vipassana-assistant

The Vipassana Chatbot Assistant — a bilingual (Vietnamese/English) AI assistant for Vipassana meditation course information and live schedules at centers in Vietnam. Deployed as a Vercel project at `vipassana-assistant.vercel.app` (Node.js serverless functions + static frontend). LLM access uses Google Gemini (free AI Studio tier) as the primary provider with OpenCode Zen as an automatic fallback.

> **For contributors**: `AGENTS.md` is the canonical guide for agent tools — architecture, request flow, security model, and the spec-driven workflow.

## Features

- **Bilingual**: responds in Vietnamese or English based on the user's language
- **Static knowledge**: loads `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md` at runtime for information about Vipassana, Mr. S.N. Goenka, Code of Discipline, daily timetable, and UCENLIST organization
- **Live course discovery**: `list_courses` scrapes `schedule.vridhamma.org` (live → cached → fallback JSON, with `data_freshness` on every record)
- **Secure**: Safe Domain Gating — only `ucenlist.org` and `*.vridhamma.org` links are ever shared (system prompt instruction + `sanitize_urls()` post-processor)
- **Human-in-the-loop**: registration is always delegated to the user via the official VRI link

## Requirements

- Node.js >= 20
- A Google AI Studio API key (get one free at https://aistudio.google.com — no credit card required). `OPENCODE_API_KEY` (https://opencode.ai/auth) is optional and enables the fallback provider.

## Setup

```bash
npm install

# Set up credentials
#   GEMINI_API_KEY   — required (primary provider: Google Gemini, https://aistudio.google.com)
#   OPENCODE_API_KEY — optional (fallback provider: OpenCode Zen, https://opencode.ai/auth)
#   LLM_PROVIDER     — optional primary provider: "gemini" (default) or "zen"
#   AGENT_MODEL      — optional model override (default gemini-3.1-flash-lite-preview)
#   FAST_MODEL       — optional legacy override (AGENT_MODEL wins if both set)
# For local dev, export them or create a .env file (e.g. via `vercel env`).
```

> **Free-tier note**: the Gemini free tier may use your inputs/outputs to improve Google products. If that matters for your deployment, enable billing in AI Studio or switch to a different provider via `LLM_PROVIDER`/`AGENT_MODEL`.

## Running locally

```bash
npm run dev
```

Then open `http://localhost:3000`. `server.js` serves the `public/` frontend and routes `POST /api/chat` to the function in `api/chat.js` — no Vercel CLI or build step needed. It loads provider keys from `.env` via Node's `--env-file` flag (Node ≥ 20.6).

Prefer the Vercel CLI instead? Install it first:

```bash
npm i -g vercel
vercel dev   # serves the same app on http://localhost:3000
```

## API

`POST /api/chat` accepts a JSON body `{ "messages": [{ "role": "user", "content": "..." }] }`.

### Response Format

Returns JSON `{ "text": "..." }` with `Content-Type: application/json`.

## Running tests

```bash
npm test            # runs node --test tests/*
```

Tests are static/no-network: domain gating (trusted/untrusted/spoof URLs), prompt-injection stripping, fallback-warning phrasing, human-in-the-loop phrasing, bilingual routing strings, plus smoke assertions on the knowledge loader, centers data, and fallback JSON shape. `tests/markdown.test.mjs` covers the UI renderer (markdown blocks, link gating, HTML escaping). `tests/router.test.mjs` and `tests/sections.test.mjs` cover the intent router and knowledge sectioning, and `tests/chat-path.test.mjs` verifies the fast/tool paths with a stubbed fetch (no network).

## Deploying

```bash
vercel link                                  # link this directory to a Vercel project
vercel env add GEMINI_API_KEY                # production — primary provider (required)
vercel env add OPENCODE_API_KEY              # optional — fallback provider
vercel env add LLM_PROVIDER                  # optional — "gemini" (default) or "zen"
vercel env add AGENT_MODEL                   # optional
vercel env add FAST_MODEL                    # optional — legacy override (AGENT_MODEL wins)
vercel deploy --prod
```

Or import the repository into Vercel from GitHub — every push to the production branch deploys.

## Architecture

```
public/index.html        # single static chat UI (bilingual, dark theme, no build step)
public/markdown.js       # zero-dependency markdown renderer (escape-first, trusted-domain-gated links)
server.js                # local dev server (npm run dev) — static public/ + routes /api/chat
api/chat.js              # POST /api/chat — intent router → fast path or tool loop → sanitized output
lib/router.js            # bilingual (EN/VI) intent router: knowledge-only vs live-data (+ tiny LLM fallback)
lib/llm.js               # multi-provider LLM access (Gemini primary, Zen fallback, 429 backoff, model resolution)
lib/quick-answers.js     # deterministic no-LLM answers (center info, Vipassana definition) for the fast path
lib/answer-cache.js      # in-memory TTL cache for repeated fast-path answers
lib/sections.js          # SKILL.md sectioning + fast-path prompt builder (trimmed knowledge context)
lib/knowledge.js         # loads SKILL.md via import.meta.url
lib/system-prompt.js     # KNOWLEDGE_SYSTEM_PROMPT (verbatim, {knowledge_base} placeholder)
lib/sanitize.js          # TRUSTED_DOMAINS + sanitize_urls() — Safe Domain Gating backstop
lib/normalize.js         # diacritic-stripping normalizer used by the router + cache keys
lib/tools/               # list_courses, get_course_details, get_center_info (tool registry + zod parse)
lib/scraper/             # vri-schedule.js (fetch + cheerio), cache.js (TTL + fallback chain)
lib/centers.js           # static center info
lib/fallback-schedule.json  # static fallback schedule data
tests/sanitize.test.mjs  # eval suite (node --test)
tests/markdown.test.mjs  # renderer unit suite (node --test)
tests/router.test.mjs    # intent-router unit suite (node --test)
tests/sections.test.mjs  # knowledge sectioning + fast-path prompt suite (node --test)
tests/chat-path.test.mjs # request-path integration suite (stubbed fetch)
tests/quick-answers.test.mjs # deterministic-answer suite (node --test)
tests/answer-cache.test.mjs  # answer-cache suite (node --test)
vercel.json              # function maxDuration + region (sin1)
```

## Security

Two layers of domain gating:
1. **System prompt instruction** — tells the LLM it must never output untrusted URLs
2. **`sanitize_urls()` post-processor** — programmatically strips any URL that doesn't match `ucenlist.org` or `vridhamma.org` from every response before it is returned
