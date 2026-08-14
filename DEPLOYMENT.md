# Deployment

The official deployment of this project lives at [vipassana-assistant.vercel.app](https://vipassana-assistant.vercel.app), deployed via the deploy workflow in this repository. Deployment happens only on pushes to the `main` branch — pushing or opening a PR from any other branch triggers no deployment.

## For contributors

There is nothing special to run — deployment is fully automated once your changes reach `main`:

1. Open a pull request to `main`. CI (`.github/workflows/ci.yml`) runs the unit tests (`npm test`) and the linter (`npm run lint`) — a PR that fails either cannot be merged.
2. When the PR is merged, a push to `main` triggers CI first; on success, the deploy workflow (`.github/workflows/deploy.yml`) ships a production deployment to `vipassana-assistant.vercel.app`. A push to `main` with failing CI does not deploy.

## Deployment architecture

The project is a Vercel project with no build step:

- **`public/`** — static frontend served as-is
- **`api/*`** — Node.js serverless functions (the only route is `POST /api/chat`)
- **`vercel.json`** — runtime configuration: `api/chat.js` runs in the `sin1` (Singapore) region with a `maxDuration` of 60s, plus security headers for every response. Automatic deployments via Vercel's Git integration are disabled (`git.deploymentEnabled: false`); all deployments are performed by the deploy workflow.

## Environment variables

Set in the Vercel project by the maintainers:

| Variable        | Required | Description                                        |
| --------------- | -------- | -------------------------------------------------- |
| `GEMINI_API_KEY`| Yes      | Google AI Studio key (LLM provider)                |
| `AGENT_MODEL`   | No       | Model override (defaults to `gemini-3.1-flash-lite-preview`) |

See `README.md` for local development and contribution instructions.
