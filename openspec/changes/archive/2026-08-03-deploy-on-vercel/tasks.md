# Tasks: Deploy on Vercel with OpenCode Zen LLM

## 0. Provider pivot: direct API instead of AI SDK

- [x] 0.1 Rejected the Vercel AI Gateway (blocked on `customer_verification_required` — requires a credit card) and pivoted to OpenCode Zen, an OpenAI-compatible endpoint at `https://opencode.ai/zen/v1` with the free `deepseek-v4-flash-free` model
- [x] 0.2 Removed the `ai` + `@ai-sdk/openai-compatible` dependencies (they added ~12MB and had an SDK-version tool-loop bug) and rewrote `api/chat.js` to call the Zen `/chat/completions` endpoint with a manual `fetch` tool loop (max 5 steps)
- [x] 0.3 Added `public/markdown.js`, a zero-dependency hand-rolled markdown renderer, so the static UI renders tables/bold/lists instead of raw markdown (the previous client link regex truncated URLs at the `&` in query strings)

## 1. Scaffold the Node project

- [x] 1.1 Create `package.json` (ESM, `"type": "module"`) with dependencies `cheerio`, `zod`; scripts `dev` (`vercel dev`) and `test` (`node --test tests/`); `engines.node >= 20`
- [x] 1.2 Create `vercel.json` with `functions.api/chat.js` `maxDuration` and `regions: ["sin1"]`
- [x] 1.3 Update `.gitignore` to add `node_modules/`, `.vercel/`, `.env`, `.env.*`
- [x] 1.4 Create `lib/centers.js` as a verbatim port of `vipassana_mcp/data/centers.py`
- [x] 1.5 Create `lib/fallback-schedule.json` as a copy of `vipassana_mcp/data/schedule_fallback.json`
- [x] 1.6 Run `npm install` and confirm `node --version` >= 20

## 2. Port the safety and prompt layer

- [x] 2.1 Create `api/sanitize.js` with `TRUSTED_DOMAINS` regex and `sanitize_urls()` ported verbatim from `cli_chatbot_agent.py`
- [x] 2.2 Create `api/system-prompt.js` exporting `KNOWLEDGE_SYSTEM_PROMPT` copied verbatim (placeholder `{knowledge_base}` intact)
- [x] 2.3 Create `api/knowledge.js` that reads `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md` resolved via `import.meta.url`, falling back to empty string on read failure

## 3. Port the course discovery layer

- [x] 3.1 Create `api/scraper/vri-schedule.js` porting `vri_schedule.py`: URL map, headers, `ScraperError`/`EmptyScheduleError` equivalents, `fetch_html`, `parse_course_table` (cheerio, `tablesaw`/`cols-5` table), `_parse_*` cell parsers, `parse_status`, `parse_dates`; lower request timeout to ~8s
- [x] 3.2 Create `api/scraper/cache.js` porting `cache.py`: 10-min short TTL, 24-h stale, `get_fallback` from `lib/fallback-schedule.json`, `get_or_fallback`
- [x] 3.3 Create `api/tools/list-courses.js` porting `list_courses.py` (zod schema: `center`, `language`, `courseType`; live → cached → fallback; `data_freshness` on every record; sort by start date)
- [x] 3.4 Create `api/tools/get-course-details.js` porting `get_course_details.py` (zod schema: `applyUrl`; cheerio parse of eligibility/comments/registration/special-instructions)
- [x] 3.5 Create `api/tools/get-center-info.js` porting `get_center_info.py` (zod schema: `center`; returns `lib/centers.js` data)

## 4. Build the chat API endpoint

- [x] 4.1 Create `api/chat.js` exporting an async `POST` handler that validates `{ messages }`, trims to the last 20 messages, and rejects oversized/non-POST requests
- [x] 4.2 In `api/chat.js`, construct the agent per request: system prompt = `KNOWLEDGE_SYSTEM_PROMPT` formatted with loaded knowledge, model from `AGENT_MODEL` (default `deepseek-v4-flash-free`), and call the OpenCode Zen chat-completions endpoint with `OPENCODE_API_KEY`
- [x] 4.3 Register the three tools with hand-written OpenAI JSON schemas and run a manual `fetch` tool loop (max 5 steps) so the model can call them automatically; tool execution errors are fed back to the model as JSON
- [x] 4.4 Sanitize the final response with `sanitize_urls()` and return `{ text }`; error path returns a safe message (never an untrusted URL)

## 5. Build the static UI

- [x] 5.1 Create `public/index.html`: dark theme (#0f172a), bilingual vi/en (default vi) with toggle, chat history, "thinking" indicator
- [x] 5.2 Add centers + official links section (ucenlist.org, schedule.vridhamma.org) and a clear-chat control
- [x] 5.3 Implement client JS: store history in `localStorage`, POST full history to `/api/chat`, render sanitized responses, cap to last 20 messages
- [x] 5.4 Render agent replies with `public/markdown.js` (module script): escape-first, trusted-domain-gated links, tables/lists/headings; user messages stay plain text

## 6. Port and run the eval suite

- [x] 6.1 Create `tests/sanitize.test.mjs` using `node:test` covering domain gating (trusted/untrusted/spoof), prompt-injection strip, fallback-warning phrasing, HITL phrasing, and bilingual routing strings in the system prompt
- [x] 6.2 Add smoke assertions: `knowledge.js` returns non-empty, `lib/centers.js` has both centers, fallback JSON shape (courses with `center_id`/`data_freshness`)
- [x] 6.3 Create `tests/markdown.test.mjs` covering inline styles, headings, lists, tables, trusted vs untrusted links (incl. `&` in query strings), `<script>` escaping, and the 🔒 removal notice
- [x] 6.4 Run `node --test tests/` and confirm all tests pass

## 7. Remove the Python codebase and docs

- [x] 7.1 Delete `chatbot_agent/`, `vipassana-course-discovery-mcp/`, `pyproject.toml`, `uv.lock`, `Dockerfile`, `Dockerfile.streamlit`, `deploy_gcp.sh`, `agents-cli-manifest.yaml`, `deployment_metadata.json`, `deployment/`, `GEMINI.md`
- [x] 7.2 Delete `docs/`
- [x] 7.3 Rewrite `README.md` for the Vercel workflow (env vars `OPENCODE_API_KEY`, `AGENT_MODEL`; `npm install`, `vercel dev`, `node --test tests/`, `vercel deploy --prod`)
- [x] 7.4 Confirm `git status` shows only intended removals and no tracked secrets

## 8. Verify and deploy

- [x] 8.1 Run `node --test tests/` from a clean `npm install`
- [x] 8.2 Run `vercel dev` with `OPENCODE_API_KEY` set and verify: a Vietnamese and an English turn, a live course lookup (with the schedule table rendered in the UI), a fallback (⚠️) path, that an injected `secure-meditation-vn.com` URL is stripped, and that the 🔒 notice renders as highlighted text
- [x] 8.3 Add environment variables in Vercel (`OPENCODE_API_KEY` required, `AGENT_MODEL` optional) and run `vercel deploy --prod` (or GitHub import)
- [x] 8.4 Verify the production URL serves the UI (markdown rendered, links trusted-domain-gated) and `/api/chat` returns sanitized responses
