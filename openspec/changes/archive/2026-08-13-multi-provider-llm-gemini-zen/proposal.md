## Why

The chatbot's only LLM provider is OpenCode Zen (`OPENCODE_API_KEY`, default `deepseek-v4-flash-free`). Zen's free tier is documented as "available for a limited time" and has repeatedly degraded the app (reasoning-model timeouts, 503s, 5–12s TTFT — see archived changes `fix-reasoning-model-timeouts`, `kb-response-latency`). Google AI Studio's Gemini free tier is indefinite, needs no credit card, and has a fast TTFT. Gemini's OpenAI-compatible endpoint means the existing payloads work unchanged, so we add it as the primary provider with Zen as an automatic fallback.

## What Changes

- **New `lib/llm.js`** — a single `chatCompletion(messages, options)` wrapper over OpenAI-compatible chat-completions endpoints with a provider table:
  - **Gemini** primary (`GEMINI_API_KEY`, `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, default model `gemini-3.1-flash-lite-preview`).
  - **OpenCode Zen** fallback (`OPENCODE_API_KEY`, `https://opencode.ai/zen/v1/chat/completions`, default model `deepseek-v4-flash-free`).
  - Provider order configurable via `LLM_PROVIDER` (default `gemini`); fallback only used when the fallback key is present.
  - `429` → exponential backoff retries on the same provider; other failures → one fallback attempt; total wall-clock capped at `timeoutMs`.
  - Model resolution (`AGENT_MODEL` > `FAST_MODEL` > provider default) moves here from `api/chat.js`.
- **`api/chat.js`** — `callChatCompletion` delegates to `lib/llm.js`; the "API key missing" gate becomes "no provider key present".
- **`lib/router.js`** — the LLM classifier (`classifyWithLLM`) delegates to `lib/llm.js`; an empty classifier response now resolves to the **tools** path (conservative bias; protects against thinking-model token consumption at `max_tokens: 8`).
- **Tests** — `tests/chat-path.test.mjs` updated for the new env contract (Gemini URL + model, fallback-on-500, Zen-only mode); new `tests/llm.test.mjs` covering provider resolution, backoff→fallback, budget capping, and missing keys.
- **Docs/specs** — README + AGENTS.md document the new env vars and fallback semantics; `vercel-deployment` spec amended from Zen-only to multi-provider (**BREAKING**: reverses "SHALL NOT require a provider API key (e.g. Gemini)").

## Capabilities

### New Capabilities
- `llm-provider-abstraction`: multi-provider OpenAI-compatible LLM access with primary + fallback, provider/model configuration, and 429-aware retry.

### Modified Capabilities
- `vercel-deployment`: the LLM-access requirement changes from "OpenCode Zen only, no provider API key" to "Gemini primary with OpenCode Zen fallback".

## Impact

- **Code:** `lib/llm.js` (new), `api/chat.js`, `lib/router.js`.
- **Tests:** `tests/chat-path.test.mjs`, `tests/llm.test.mjs` (new).
- **Env:** `GEMINI_API_KEY` (new, required), `OPENCODE_API_KEY` (now fallback, optional), `LLM_PROVIDER` (new, optional, default `gemini`), `AGENT_MODEL`/`FAST_MODEL` (unchanged).
- **Specs:** `openspec/specs/vercel-deployment/spec.md` amended.
- **Docs:** README.md, AGENTS.md.
- **No changes:** `vercel.json`, `lib/sanitize.js`, deterministic answer layers, cache, tool registry, scraper.