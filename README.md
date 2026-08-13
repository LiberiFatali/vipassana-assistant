# vipassana-assistant

A bilingual (Vietnamese/English) AI assistant that answers questions about Vipassana meditation courses run by UCENLIST in Vietnam — covering course information, live schedules, and registration for the centers Dhamma Virocana (Hà Nội) and Dhamma Vutthi (TP. HCM).

Live at [vipassana-assistant.vercel.app](https://vipassana-assistant.vercel.app).

> **For contributors**: `AGENTS.md` is the canonical guide for the architecture, request flow, security model, and spec-driven workflow.

## Features

- **Bilingual** — responds in Vietnamese or English based on how you ask
- **Static knowledge** — Vipassana background, Code of Discipline, daily timetable, center info, and FAQs
- **Live course discovery** — up-to-date schedules scraped from `schedule.vridhamma.org`
- **Secure** — only trusted `ucenlist.org` / `vridhamma.org` links are ever shared
- **Human-in-the-loop** — registration always goes through the official VRI link, clicked by you

## Requirements

- Node.js ≥ 20
- A free Google AI Studio API key: `GEMINI_API_KEY` (https://aistudio.google.com)

## Quick start

```bash
npm install
# create a .env file with GEMINI_API_KEY (see AGENTS.md for all env vars)
npm run dev
```

Open http://localhost:3000. Alternatively use the Vercel CLI: `npm i -g vercel && vercel dev`.

## Tests & lint

```bash
npm test    # unit + integration suites (node --test)
npm run lint  # ESLint
```

On every pull request to `main` (and on pushes to `main`), GitHub Actions runs both — see `.github/workflows/ci.yml`.

## Deploy

```bash
vercel link
vercel env add GEMINI_API_KEY
vercel deploy --prod
```

Or import the repository on Vercel and let it deploy from GitHub. Pushes to `main` deploy to production; pull requests get a preview URL (`.github/workflows/deploy.yml`). One secret is required: `VERCEL_TOKEN` (Vercel → Account Settings → Tokens).

## Security

Two layers of domain gating: a system-prompt instruction that forbids untrusted URLs, plus a `sanitize_urls()` post-processor that strips anything not matching the trusted domains from every response.
