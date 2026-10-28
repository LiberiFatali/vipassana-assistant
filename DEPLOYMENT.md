# Deployment

The official deployment of this project lives at [vipassana-assistant.vercel.app](https://vipassana-assistant.vercel.app), deployed via the deploy workflow in this repository. Deployment is triggered manually via GitHub Actions workflow dispatch.

## Deployment workflow

Deployments are intentionally manual rather than automatic on push:

1. **Pull requests & commits to `main`**: CI (`.github/workflows/ci.yml`) runs unit tests (`npm test`), linter (`npm run lint`), and typecheck (`npm run typecheck`). Commits reaching `main` must pass CI.
2. **Triggering a deployment**: Maintainers trigger deployment manually through GitHub Actions:
   - **GitHub UI**: Navigate to **Actions** → **Deploy to Vercel** → click **Run workflow** on `main`.
   - **GitHub CLI**: Run `gh workflow run deploy.yml --ref main`.

When triggered, the deploy workflow (`.github/workflows/deploy.yml`) checks out `main`, builds the project with Vercel CLI, and deploys production artifacts directly to `vipassana-assistant.vercel.app`.

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
