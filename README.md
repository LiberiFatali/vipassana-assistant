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

## Deployment

Live at [vipassana-assistant.vercel.app](https://vipassana-assistant.vercel.app). Only pushes to `main` deploy — to production, and only after CI passes — see [DEPLOYMENT.md](DEPLOYMENT.md).

## Contributing

PRs to `main` are welcome. For anything non-trivial, check `AGENTS.md` first — it covers the architecture, request flow, security model, and the spec-driven OpenSpec workflow.

1. Branch, then `npm install`.
2. Run locally with `npm run dev` (needs `GEMINI_API_KEY` in `.env`).
3. Ensure `npm test` and `npm run lint` pass.
4. Open a pull request to `main`. CI runs on every PR; merging deploys to production once CI passes (see [DEPLOYMENT.md](DEPLOYMENT.md)).

## Security

Two layers of domain gating: a system-prompt instruction that forbids untrusted URLs, plus a `sanitize_urls()` post-processor that strips anything not matching the trusted domains from every response.

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE) (or any later version). Any use or modification of this project must remain AGPL-3.0, preserve the attribution notice, and credit the original repository [vipassana-assistant](https://github.com/LiberiFatali/vipassana-assistant).
