# AGENTS.md

This file provides guidance to agent tools (opencode and others) when working with code in this repository.

## What this is

A bilingual (Vietnamese/English) chatbot agent that answers questions about Vipassana meditation courses run by UCENLIST at two centers in Vietnam (Dhamma Virocana in Hà Nội, Dhamma Vutthi in TP. HCM). It combines a static knowledge base (embedded skill doc) with live course-schedule lookups via a companion scraper, and enforces strict output safety (domain gating, human-in-the-loop registration).

The project is a Node.js serverless app deployed on Vercel. The public surface is a single endpoint `POST /api/chat`. It returns JSON `{ text }` (the client owns the conversation history). LLM access uses Google Gemini (free AI Studio tier) over OpenAI-compatible chat-completions (`lib/llm.js`).

## Commands

```bash
npm install

# Set up credentials
#   GEMINI_API_KEY   — required (LLM provider: Google Gemini, https://aistudio.google.com)
#   AGENT_MODEL      — optional model override (default gemini-3.1-flash-lite-preview)
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
api/chat.js              # POST /api/chat — intent router → fast path or tool loop → sanitized output
lib/router.js            # bilingual (EN/VI) intent router: knowledge-only vs live-data (+ tiny LLM fallback)
lib/llm.js               # LLM access via provider registry — OpenAI-compatible chat-completions, Gemini
                         #   (gemini-3.1-flash-lite-preview, GEMINI_API_KEY); 429 backoff; model resolution
                         #   (AGENT_MODEL > provider default); total budget = timeoutMs
lib/quick-answers.js     # deterministic no-LLM answers (center info, Vipassana definition, FAQ) for the fast path
lib/answer-cache.js      # in-memory TTL cache for repeated fast-path answers
lib/sections.js          # SKILL.md sectioning + fast-path prompt builder (trimmed knowledge context)
lib/knowledge.js         # loads SKILL.md from disk, module-cached
lib/system-prompt.js     # KNOWLEDGE_SYSTEM_PROMPT template ({knowledge_base} placeholder)
lib/sanitize.js          # TRUSTED_DOMAINS + sanitize_urls() — Safe Domain Gating backstop
lib/normalize.js         # diacritic-stripping normalizer (router + cache keys)
lib/log.js               # zero-dep structured JSON-line logging (AsyncLocalStorage correlation, safeErr, qPreview/qHash, LOG_LEVEL)
lib/tools/               # list_courses, get_course_details, get_center_info (registry + zod parse)
lib/schedule-answers.js  # deterministic schedule answers (windowed + default-upcoming queries, no LLM)
lib/scraper/             # vri-schedule.js (fetch + cheerio), cache.js (TTL + fallback chain)
lib/centers.js           # static center info
lib/fallback-schedule.json  # static fallback schedule data
tests/                   # node:test suites (sanitize, markdown, router, sections, chat-path, log, logging-path, quick-answers, answer-cache)
vercel.json              # function maxDuration + region (sin1)
```

Only `api/chat.js` lives under `api/` — everything else moved to `lib/` (Vercel's 12-function-per-deployment limit counts every `api/*.js` file as a serverless function). `find api -name '*.js'` must return exactly `api/chat.js`.

### Request flow (relevant to latency work)

`api/chat.js` classifies the latest user message with `lib/router.js`:

- **Knowledge-only (`kb`)** → fast path, in this order: (1) deterministic structured answers via `lib/quick-answers.js` (center address/phone/email/website from `lib/centers.js`, curated bilingual Vipassana definition, and common FAQs like cost/diet/eligibility) with **no LLM call**; (2) the in-memory answer cache (`lib/answer-cache.js`, keyed by `lang|normalized question`) for repeated questions; (3) a single LLM call with a trimmed system prompt (only the relevant SKILL.md sections via `lib/sections.js`), **no tools attached**. Every fast-path output passes through `sanitize_urls()`. Every LLM call (classifier, fast path, composer, retries) goes through `lib/llm.js`: Gemini (`gemini-3.1-flash-lite-preview`, `GEMINI_API_KEY`) with 429 backoff, and the model resolved as `AGENT_MODEL` > provider default.
- **Live-data (`tools`)** → first the deterministic schedule fast path (`lib/schedule-answers.js`): a windowed schedule query (a schedule/course keyword plus a center and/or time window such as "cuối tháng này", "tháng này", "tháng sau", "tuần này/khác", "tháng N") calls `list_courses` once and renders a bilingual markdown answer with **no LLM call and no tools**. A bare schedule query with a course noun but no center/time window ("khóa thiền sắp tới", "which courses") defaults to the upcoming-courses list across both centers. Anything that doesn't match (or fails) returns `null` and falls through to the composer path. `list_courses` scrapes `schedule.vridhamma.org` (parallel across centers for `center="all"`, in-flight dedup) with a live → cached → fallback chain; every record carries `data_freshness` (`"live"` / `"cached"` / `"fallback"`).

Do not break these invariants: the fast path must never attach tools, the final text of every path must pass through `sanitize_urls()`, and the tool path must keep the full knowledge base.

### Data-freshness fallback chain

Live scrape → 10-min in-memory cache → stale cache (up to 24h) → `lib/fallback-schedule.json`. The system prompt requires surfacing a `⚠️` warning whenever `data_freshness == "fallback"`. The in-memory cache is per-function-instance; Vercel cold starts re-scrape.

### Observability & logging

`lib/log.js` emits one JSON object per line via `console.*` (info→log, warn→warn, error→error) into Vercel Runtime Logs — no dependencies, no Pro features. `api/chat.js` wraps each request in `withLogContext({ requestId, conversationId, lang })` (AsyncLocalStorage), so every line from any module carries the same correlation IDs with no signature churn. The client sends an optional `conversationId` (`crypto.randomUUID()` persisted in `localStorage`, rotated on Clear) so a full conversation is greppable across requests; the server tolerates its absence.

Key events: `request.start`, `route.decision`, `path.answer` (path ∈ `out-of-scope|missing-key|quick|cache|fast|schedule|quick-fallback|composer`, with `latencyMs`/`answerLen`), `request.end` (outcome ok/error/timeout); `llm.call`/`llm.backoff`/`llm.error`/`llm.key-missing`; `schedule.fetch` (reports `data_freshness` live/cached/fallback per center) and `schedule.fetch-error`; `schedule.deterministic.error`/`schedule.context.error` (the previously silent schedule-path catches).

Privacy posture: full user messages and full answers are never logged. Query text appears only as `qPreview` (first 80 chars, diacritic-stripped) plus `qHash` (16-hex sha256) for repeat detection; errors pass through `safeErr` (name + message capped at 300 chars, no stacks/keys/payloads). `LOG_LEVEL` env (default `info`) filters severity. Do not log provider keys, `Authorization` headers, or raw `Error` objects.

## Knowledge skill

`.agents/skills/vipassana-ucenlist-knowledge/SKILL.md` is the single source of truth for static content (Vipassana background, S.N. Goenka, Code of Discipline, daily timetable, center details, FAQs). It is read off disk at request time and injected into the prompt. Edit it in place — there is no other copy to keep in sync.

## Security model (do not weaken without explicit request)

1. **Safe Domain Gating**: only `ucenlist.org` and `*.vridhamma.org` URLs may ever reach the user — enforced both in the system prompt and programmatically via `sanitize_urls()`/`TRUSTED_DOMAINS` in `lib/sanitize.js`. This dual-layer ("prompt says don't + code enforces it") is intentional — treat both layers as required when touching domain-gating logic. The fast path still passes through `sanitize_urls()`.
2. **Human-in-the-loop registration**: the agent must never submit registration forms or handle personal data — it only ever hands the user an `apply_url` and tells them to click it themselves.
3. **Prompt injection defense**: the system prompt explicitly instructs the model to refuse externally-supplied URLs claiming to be official; `sanitize_urls()` is the backstop if the model is fooled anyway.

## Spec-driven workflow (OpenSpec)

This repo uses the `openspec` CLI for spec-driven change management. The workflow definitions are duplicated across agent tooling: `.opencode/` (opencode commands `/opsx-propose`, `/opsx-explore`, `/opsx-apply`, `/opsx-archive` + matching skills) and `.agent/` (generic mirror). Specs live in `openspec/specs/<capability>/spec.md` (chatbot-agent, course-discovery, intent-routing, project-hygiene, ucenlist-knowledge, etc.); change proposals are scaffolded under `openspec/changes/` and archived under `openspec/changes/archive/`. When making a non-trivial behavioral change, check `openspec/specs/` first — it documents the intended requirements/scenarios that code and evals are expected to satisfy.

## Eval caveat

The test suites grep exact substrings out of `KNOWLEDGE_SYSTEM_PROMPT` (`lib/system-prompt.js`) and the router/sections modules — e.g. `language="vi"`, `language="en"`, `⚠️`, "NEVER fill out", "Please click the link". Renaming these phrases, or changing the static prompt string, can silently break `tests/*`. Keep the static prompt string byte-for-byte unchanged unless you update the tests deliberately.
