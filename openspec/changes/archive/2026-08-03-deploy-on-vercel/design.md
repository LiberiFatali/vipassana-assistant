# Design: Deploy on Vercel with OpenCode Zen LLM

## Context

The chatbot is currently a Python Google ADK agent (`chatbot_agent/cli_chatbot_agent.py`) that connects over stdio to a sibling MCP server (`vipassana-course-discovery-mcp`) and is served via Streamlit / FastAPI (A2A/Vertex AI) on GCP. It enforces a dual-layer Safe Domain Gating (system prompt + `sanitize_urls()`), bilingual vi/en responses, a live→cached→fallback schedule chain with `data_freshness`, human-in-the-loop registration handoff, and a dynamic knowledge base loaded from `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md`.

Target: a minimal Node.js serverless app on Vercel. Constraint: Vercel Functions cannot spawn subprocesses (MCP stdio is impossible), and the user wants free LLM access via OpenCode Zen (OpenAI-compatible endpoint, free `deepseek-v4-flash-free` model, API key from opencode.ai/auth). The agent behavioral requirements (openspec specs `chatbot-agent`, `course-discovery`, `ucenlist-knowledge`) are preserved; only the deployment platform (`gcp-deployment`), the UI hosting (`streamlit-ui`), and repo hygiene (`project-hygiene`) specs change.

## Goals / Non-Goals

**Goals:**
- One Vercel project: static `public/` frontend + `api/` Node.js serverless functions, deployable via `vercel` CLI or GitHub import.
- Replace Gemini key with OpenCode Zen (`OPENCODE_API_KEY`), model default `deepseek-v4-flash-free`, env-configurable via `AGENT_MODEL`.
- Preserve all agent behavior: sanitized domain gating (exact same regex + output), `data_freshness` chain + `⚠️` fallback warning, bilingual routing, HITL registration, dynamic SKILL.md knowledge base, and the five eval categories.
- Remove the entire Python codebase and `docs/`.

**Non-Goals:**
- Streaming token-by-token responses (chunk-wise streaming would break `sanitize_urls()` on URLs split across tokens).
- Server-side persistence/sessions (history is client-side; each request is stateless).
- Multi-instance shared cache (in-process cache is best-effort per warm instance; no Vercel KV in v1).
- A React/Next.js build (deliberately a single static HTML page).

## Decisions

### D1. Platform: plain Node.js serverless + static HTML (not Next.js, not Python)
Vercel's Node Functions + `public/` static hosting need no build step. Python on Vercel cannot run the MCP subprocess model and drags in a heavy runtime; Next.js is unnecessary given the single-page UI. Alternative considered: Next.js app router — rejected for added build complexity with no benefit here.

### D2. LLM access: OpenCode Zen via direct `fetch`
OpenCode Zen exposes an OpenAI-compatible API at `https://opencode.ai/zen/v1` (chat completions at `/chat/completions`). We call it with a plain `fetch` (no SDK) and model id `deepseek-v4-flash-free` (default, $0/1M tokens, reasoning + tool calling). The API key is obtained from opencode.ai/auth and supplied via `OPENCODE_API_KEY`. Alternatives considered: (1) Vercel AI Gateway (`ai-gateway.vercel.sh/v1`) — rejected because its free tier 403s with `customer_verification_required` (a credit card must be on file), which the user declined; Zen's free models skip billing validation. (2) AI SDK `ai` + `@ai-sdk/openai-compatible` — rejected because it added ~12MB of dependencies and the v7 tool loop is driven by `stopWhen` (default `isStepCount(1)`, so multi-step tool calls silently stopped after one step); a direct loop gives us explicit control. Free-tier caveat: Zen free models are "available for a limited time" and rate-limited; `AGENT_MODEL` is env-configurable so the user can swap to a paid Zen model (e.g. `deepseek-v4-flash` at $0.14/$0.28 per 1M) if the free tier becomes unavailable.

### D3. Agent endpoint: `POST /api/chat` with full client-supplied history
Client sends `{ messages: [{role, content}] }`; the server prepends the system prompt (base template + injected SKILL.md) and runs a manual tool loop against Zen's `/chat/completions`: POST with `tools` + `tool_choice: "auto"`, and while the assistant reply carries `tool_calls` (max 5 steps), append the assistant tool-call message plus the tool results (`role: "tool"`, `tool_call_id`), then re-POST. Tool execution errors are returned to the model as JSON so it can adapt. Finally the complete text passes through `sanitize_urls()` and the endpoint returns `{ text }`. Non-streaming by design (D-non-streaming). Message count is capped (last 20) to bound tokens, and a per-request AbortController enforces a 50s budget within Vercel's 60s `maxDuration`. This keeps the server stateless and preserves the dual-layer security model.

### D4. Tool layer: inline ports of the three MCP tools
`listCourses`, `getCourseDetails`, `getCenterInfo` are registered in a small tool registry with hand-written OpenAI function JSON schemas (zod has no JSON-schema generator in v4) plus the zod `parse` functions for input coercion/defaults. Params mirror the originals (`center`, `language`, `courseType`; `applyUrl`). `getCourseDetails` fetches and parses the apply page with cheerio (port of `_parse_detail_page`). `getCenterInfo` reads static `lib/centers.js`.

### D5. Scraper: `fetch` + cheerio port of `vri_schedule.py`
Same parsing logic: browser-like headers, Drupal `tablesaw cols-5` table discovery, empty-tbody → treated as scrape failure, `parse_status`/`parse_dates` helpers ported verbatim. Per-request timeout lowered to ~8s and scrape failures never raise to the user — they trigger the fallback chain. Alternative considered: Playwright (JS-rendered table) — not bundled in Python today, stays out of scope.

### D6. Fallback chain and cache semantics
Same chain: live scrape → in-process TTL cache (10 min / 24 h stale) → `lib/fallback-schedule.json`. Every course carries `data_freshness` (`live`/`cached`/`fallback`). On Vercel the in-process cache is per-warm-instance only (serverless), so worst case is a live scrape each request or immediate fallback — both already handled by the prompt's `⚠️` rule. Vercel KV + cron warm-up is a documented future upgrade, not v1.

### D7. Security and knowledge ports are verbatim
- `TRUSTED_DOMAINS` regex and `sanitize_urls()` ported line-for-line to `api/sanitize.js` (the hard backstop).
- `KNOWLEDGE_SYSTEM_PROMPT` copied verbatim to `api/system-prompt.js` (keeps eval-greppable strings: `language="vi"`, `⚠️`, `"NEVER fill out"`, `"Please click the link"`).
- `api/knowledge.js` reads `SKILL.md` at cold start, resolved from module path via `import.meta.url` (not `process.cwd()`, which is unreliable on Vercel). Project files are readable at runtime on Vercel.

### D8. UI: single `public/index.html` + hand-rolled markdown renderer
Dark theme (#0f172a), vi/en toggle (default vi), chat history in `localStorage`, centers + official-links section, fetch-based POST to `/api/chat` with a "thinking" indicator. Agent replies render through `public/markdown.js`, a zero-dependency ESM renderer: escape-first (input is HTML-escaped before any tag is emitted), blocks for `###` headings/tables/lists/blockquotes, inline **bold**/*italic*/`code`/`[text](url)`, and links gated by the same trusted-domain regex as the server (anything else becomes a 🔒 removal notice). This fixes the earlier UI bugs where tables/lists showed raw markdown and the old client link regex truncated trusted URLs at the `&` in query strings. User messages stay plain text. Mirrors the Streamlit UI's bilingual content and behavior.

### D9. Evals: port to `node --test`
`tests/sanitize.test.mjs` covers the same five categories: domain gating (incl. `phishing.vridhamma.org.evil.com` spoof), prompt injection strip, fallback-warning phrasing, HITL phrasing, bilingual routing strings. Plus smoke assertions: knowledge loader non-empty, centers data shape, fallback JSON shape. `tests/markdown.test.mjs` unit-tests the renderer: inline styles, headings, lists, tables, trusted vs untrusted links (incl. `&` in query strings), `<script>` escaping, and the 🔒 removal notice.

### D10. Vercel configuration
`vercel.json`: `functions.api/chat.js.maxDuration` (Fluid Compute default; set generous bound), `regions: ["sin1"]` (Singapore, closest to Vietnam). Env vars: `OPENCODE_API_KEY` (required), `AGENT_MODEL` (optional, default `deepseek-v4-flash-free`).

### D11. Repo cleanup
Delete Python codebase + `docs/`; rewrite `README.md`; update `.gitignore` (`node_modules/`, `.vercel/`, `.env*`); update openspec specs and archive this change per the openspec workflow.

## Risks / Trade-offs

- **OpenCode Zen free-tier availability (limited-time models, rate limits)** → Default to `deepseek-v4-flash-free` ($0, tool calling); `AGENT_MODEL` env-configurable; verify first live turn in `vercel dev`; escalation path is a paid Zen model (e.g. `deepseek-v4-flash`) or a different OpenAI-compatible provider.
- **schedule.vridhamma.org may block Vercel IPs or be slow** → Fallback JSON + `⚠️` is the designed degradation; keep per-request timeout low; Vercel KV + cron is the future fix.
- **In-process cache resets on cold starts** → Behavior stays correct (live scrape or fallback), just more scraping traffic; acceptable for a non-profit Hobby deployment.
- **Non-streaming UX** → "Thinking" indicator; acceptable trade-off for guaranteed URL sanitization at the single trustworthy point.
- **Chunked URL sanitization is unsafe** → Mitigated by design (D-non-streaming): sanitize only the complete final text.
- **Direct `fetch` tool loop edge cases** → Multi-step tool results echo `tool_call_id`/`function` fields only (reasoning payloads dropped, they are not valid request fields); step cap and timeout guard runaway loops; tool execution failures are surfaced to the model as JSON rather than aborting.
- **Path resolution on Vercel** → Use `import.meta.url` for SKILL.md/fallback JSON, verified in `vercel dev`.

## Migration Plan

1. Scaffold Node project (`package.json`, `vercel.json`, `.gitignore`).
2. Port safety/knowledge/system-prompt/sanitize modules first (no network deps beyond AI SDK).
3. Port scraper, cache, tools, centers, fallback data.
4. Build `api/chat.js` and `public/index.html`.
5. Port evals (sanitize + markdown renderer); run `node --test tests/`.
6. `vercel dev` locally with `OPENCODE_API_KEY`; verify live course lookup and sanitization.
7. Remove Python + `docs/`; rewrite README; update specs.
8. Deploy: `vercel link` → `vercel env add` → `vercel deploy --prod` (or GitHub import). Rollback: re-deploy previous production deployment via Vercel dashboard.

## Open Questions

- Confirm the default model `deepseek-v4-flash-free` accepts the user's `OPENCODE_API_KEY` from a `sin1` datacenter (free tier throttling unknown) — resolvable at first `vercel dev` run; `AGENT_MODEL` env var is the fallback switch.
