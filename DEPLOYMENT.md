# Deployment

The official deployment of this project lives at [vipassana-assistant.vercel.app](https://vipassana-assistant.vercel.app), deployed by Vercel directly from this repository.

## For contributors

There is nothing special to run — deployment is fully automated once your changes reach `main`:

1. Open a pull request to `main`. The deploy workflow (`.github/workflows/deploy.yml`) builds a Vercel preview and comments the preview URL on your PR. CI (`.github/workflows/ci.yml`) runs the unit tests (`npm test`) and the linter (`npm run lint`) — a PR that fails either cannot be merged.
2. When the PR is merged, a push to `main` triggers a production deployment to `vipassana-assistant.vercel.app`.

## Deployment architecture

The project is a Vercel project with no build step:

- **`public/`** — static frontend served as-is
- **`api/*`** — Node.js serverless functions (the only route is `POST /api/chat`)
- **`vercel.json`** — runtime configuration: `api/chat.js` runs in the `sin1` (Singapore) region with a `maxDuration` of 60s, plus security headers for every response

## Environment variables

Set in the Vercel project by the maintainers:

| Variable        | Required | Description                                        |
| --------------- | -------- | -------------------------------------------------- |
| `GEMINI_API_KEY`| Yes      | Google AI Studio key (LLM provider)                |
| `AGENT_MODEL`   | No       | Model override (defaults to `gemini-3.1-flash-lite-preview`) |

See `README.md` for local development and contribution instructions.
