# vipassana-ucenlist-agent

The Vipassana UCENLIST Chatbot — a bilingual (Vietnamese/English) AI assistant for Vipassana meditation course information and live schedules at UCENLIST centers in Vietnam. Deployed as a Vercel project (Node.js serverless functions + static frontend), using OpenCode Zen for free LLM access.

## Features

- **Bilingual**: responds in Vietnamese or English based on the user's language
- **Static knowledge**: loads `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md` at runtime for information about Vipassana, Mr. S.N. Goenka, Code of Discipline, daily timetable, and UCENLIST organization
- **Live course discovery**: `list_courses` scrapes `schedule.vridhamma.org` (live → cached → fallback JSON, with `data_freshness` on every record)
- **Secure**: Safe Domain Gating — only `ucenlist.org` and `*.vridhamma.org` links are ever shared (system prompt instruction + `sanitize_urls()` post-processor)
- **Human-in-the-loop**: registration is always delegated to the user via the official VRI link

## Requirements

- Node.js >= 20
- An OpenCode Zen API key (sign in at https://opencode.ai/auth and copy the key; free models need no credit card)

## Setup

```bash
npm install

# Set up credentials
#   OPENCODE_API_KEY — required (OpenCode Zen API key, https://opencode.ai/auth)
#   AGENT_MODEL      — optional (default deepseek-v4-flash-free)
# For local dev, export them or create a .env file (e.g. via `vercel env`).
```

## Running locally

```bash
npm run dev
```

Then open `http://localhost:3000`. `server.js` serves the `public/` frontend and routes `POST /api/chat` to the function in `api/chat.js` — no Vercel CLI or build step needed. It loads `OPENCODE_API_KEY` from `.env` via Node's `--env-file` flag (Node ≥ 20.6).

Prefer the Vercel CLI instead? Install it first:

```bash
npm i -g vercel
vercel dev   # serves the same app on http://localhost:3000
```

## Running tests

```bash
npm test            # runs node --test tests/*
```

Tests are static/no-network: domain gating (trusted/untrusted/spoof URLs), prompt-injection stripping, fallback-warning phrasing, human-in-the-loop phrasing, bilingual routing strings, plus smoke assertions on the knowledge loader, centers data, and fallback JSON shape. `tests/markdown.test.mjs` covers the UI renderer (markdown blocks, link gating, HTML escaping).

## Deploying

```bash
vercel link                                  # link this directory to a Vercel project
vercel env add OPENCODE_API_KEY              # production
vercel env add AGENT_MODEL                   # optional
vercel deploy --prod
```

Or import the repository into Vercel from GitHub — every push to the production branch deploys.

## Architecture

```
public/index.html        # single static chat UI (bilingual, dark theme, no build step)
public/markdown.js       # zero-dependency markdown renderer (escape-first, trusted-domain-gated links)
server.js                # local dev server (npm run dev) — static public/ + routes /api/chat
api/chat.js              # POST /api/chat — direct fetch tool loop to OpenCode Zen, returns sanitized { text }
api/system-prompt.js     # KNOWLEDGE_SYSTEM_PROMPT (verbatim, {knowledge_base} placeholder)
api/knowledge.js         # loads SKILL.md via import.meta.url
api/sanitize.js          # TRUSTED_DOMAINS + sanitize_urls() — Safe Domain Gating backstop
api/tools/               # list_courses, get_course_details, get_center_info (tool registry + zod parse)
api/scraper/             # vri-schedule.js (fetch + cheerio), cache.js (TTL + fallback chain)
lib/centers.js           # static center info
lib/fallback-schedule.json  # static fallback schedule data
tests/sanitize.test.mjs  # eval suite (node --test)
tests/markdown.test.mjs  # renderer unit suite (node --test)
vercel.json              # function maxDuration + region (sin1)
```

## Security

Two layers of domain gating:
1. **System prompt instruction** — tells the LLM it must never output untrusted URLs
2. **`sanitize_urls()` post-processor** — programmatically strips any URL that doesn't match `ucenlist.org` or `vridhamma.org` from every response before it is returned
