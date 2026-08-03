# Proposal: Deploy on Vercel with OpenCode Zen (free LLM access)

## Why

The chatbot currently runs on Google ADK + the `vipassana-mcp` stdio subprocess and is deployed to GCP (Cloud Run / Vertex AI / Streamlit). Vercel serverless cannot spawn subprocesses, so the MCP-over-stdio architecture is not portable, and the Gemini API key is a paid dependency. Moving to Vercel gives free LLM access via OpenCode Zen (free `deepseek-v4-flash-free` model over the OpenAI-compatible `https://opencode.ai/zen/v1` endpoint) and a simpler, zero-maintenance deployment surface. (The Vercel AI Gateway alternative was dropped: its free tier requires a credit card on file, which the user declined.)

## What Changes

- **BREAKING**: Remove the entire Python codebase (`chatbot_agent/`, `vipassana-course-discovery-mcp/`, `pyproject.toml`, `uv.lock`, `Dockerfile`, `Dockerfile.streamlit`, `deploy_gcp.sh`, `agents-cli-manifest.yaml`, `deployment_metadata.json`, `deployment/`, `GEMINI.md`) and `docs/`.
- Replace the Google ADK agent with a minimal Node.js serverless app: `api/chat.js` is the single agent endpoint using a direct `fetch` tool loop against OpenCode Zen's OpenAI-compatible `/chat/completions` (no AI SDK — the SDK added ~12MB and its v7 tool loop silently stopped after one step).
- Replace LLM access: `GOOGLE_API_KEY`/Gemini → **OpenCode Zen** (`https://opencode.ai/zen/v1`) authenticated by `OPENCODE_API_KEY`; model `AGENT_MODEL` default `deepseek-v4-flash-free`.
- Replace MCP-over-stdio with inlined tools in `api/tools/` (port of the three MCP tools) backed by a Node scraper (`fetch` + cheerio) and the same live → cached → fallback JSON chain; `data_freshness` and the `⚠️` fallback warning behavior are preserved.
- Replace the Streamlit UI with a single static `public/index.html` chat UI (bilingual vi/en, dark theme, client-side history, no build step), rendering agent replies through a hand-rolled zero-dependency markdown renderer (`public/markdown.js`) with escape-first sanitization and trusted-domain-gated links.
- Keep intact (ported as-is): `TRUSTED_DOMAINS` + `sanitize_urls()` domain gating, `KNOWLEDGE_SYSTEM_PROMPT` wording (eval-greppable phrases), and the dynamic load of `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md`.
- Port `eval_agent.py` to `node --test` (`tests/sanitize.test.mjs` + `tests/markdown.test.mjs`) so the same five eval categories pass under Node.
- Update `.gitignore` (add `node_modules/`, `.vercel/`) and rewrite `README.md` for the Vercel workflow.

## Capabilities

### New Capabilities
- `vercel-deployment`: Deploy the chatbot as a Vercel project — Node.js serverless `api/` functions, static `public/` hosting, OpenCode Zen LLM access, env-var configuration, and CLI/GitHub deployment.

### Modified Capabilities
- `gcp-deployment`: **Removed** — Cloud Run/Artifact Registry/GCP deployment is replaced by Vercel.
- `streamlit-ui`: The chat requirements (interactive bilingual chat, course discovery display, safe domain gating, registration handoff) are unchanged; the "Docker Deployment Setup" requirement is replaced by static hosting on Vercel (the UI is no longer Streamlit).
- `project-hygiene`: Update scenarios that reference the Python layout (`chatbot_agent/`, `vipassana_mcp/`, ADK session db) to the Node layout (`.vercel/`, `node_modules/`, agent built per-request in `api/chat.js`), and the README scenario to match the new layout.

## Impact

- **Code**: deletes ~all Python modules; adds `api/chat.js`, `api/tools/*`, `api/scraper/*`, `api/knowledge.js`, `api/sanitize.js`, `api/system-prompt.js`, `lib/centers.js`, `lib/fallback-schedule.json`, `public/index.html`, `public/markdown.js`, `tests/sanitize.test.mjs`, `tests/markdown.test.mjs`, `package.json`, `vercel.json`.
- **APIs**: `POST /api/chat` (new); OpenCode Zen OpenAI-compatible endpoint; outbound `fetch` to `schedule.vridhamma.org`.
- **Dependencies**: remove Python (google-adk, mcp, streamlit, aiohttp, a2a); add `cheerio`, `zod`.
- **Systems**: Vercel (functions + static + env vars) + OpenCode Zen (LLM) replaces GCP Cloud Run / Vertex AI / Streamlit / AI Gateway.
- **Preserved data**: `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md`, fallback course data, center info.
