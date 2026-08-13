## Why

OpenCode Zen was added as a fallback provider when Gemini was introduced, but the project has since standardized on Google Gemini's free tier as the single, reliable primary provider. The Zen fallback (`OPENCODE_API_KEY`, `LLM_PROVIDER`, `deepseek-v4-flash-free`) is now dead weight: it adds a second key, a provider-switch env var, and a fallback code path to maintain, with no current consumer. Removing it eliminates the fallback provider, its API key, and all secret/sensitive references from the codebase.

## What Changes

- **Remove the `zen` provider** from the `PROVIDERS` registry in `lib/llm.js` (endpoint `https://opencode.ai/zen/v1/chat/completions`, `OPENCODE_API_KEY`, default model `deepseek-v4-flash-free`).
- **Remove `LLM_PROVIDER`** env var — with a single provider it is dead configuration whose only valid value was `zen`.
- **Drop `FAST_MODEL`** legacy override — model resolution becomes `AGENT_MODEL` > provider default (Gemini's `gemini-3.1-flash-lite-preview`).
- **Simplify fallback logic**: keep the `PROVIDERS` registry abstraction and the 429 backoff, but the provider chain becomes a single-iteration (Gemini only); no cross-provider fallback.
- **Update tests**: delete Zen/fallback/`LLM_PROVIDER`/`FAST_MODEL` coverage in `tests/llm.test.mjs` and `tests/chat-path.test.mjs`.
- **Update docs**: `AGENTS.md` env list and request-flow description; `api/chat.js` stale comments.
- **Update specs**: remove the fallback, `LLM_PROVIDER`, `FAST_MODEL`, and `deepseek` default requirements from `llm-provider-abstraction`, `vercel-deployment`, and `fast-kb-answers` specs.
- **Remove the `OPENCODE_API_KEY` line** from the local `.env` (untracked; no rotation step needed — the key never left the machine).

## Capabilities

### New Capabilities
<!-- None — this change removes behavior, it introduces no new capability. -->

### Modified Capabilities
- `llm-provider-abstraction`: remove the fallback-provider requirement, `LLM_PROVIDER` selection, and `FAST_MODEL` model resolution; model resolves as `AGENT_MODEL` > provider default.
- `vercel-deployment`: remove the "Gemini fails → Zen fallback" and "Provider is configurable" (`LLM_PROVIDER=zen`) scenarios; fix the configurable-model default to Gemini-only.
- `fast-kb-answers`: remove the "Configurable faster model (`FAST_MODEL`) for the knowledge fast path" requirement; the fast path uses the single resolved model (retry-once resilience remains, same model).

## Impact

- **Code**: `lib/llm.js` (provider registry, `resolveModel`, `hasProviderKey`, `warnApiKeyMissing`, `resolveProviders`), `api/chat.js` (comments only).
- **Tests**: `tests/llm.test.mjs`, `tests/chat-path.test.mjs`.
- **Docs**: `AGENTS.md`, `.env` (local only).
- **Specs**: `openspec/specs/llm-provider-abstraction/spec.md`, `openspec/specs/vercel-deployment/spec.md`, `openspec/specs/fast-kb-answers/spec.md`.
- **Env vars**: remove `OPENCODE_API_KEY`, `LLM_PROVIDER`, `FAST_MODEL`; keep `GEMINI_API_KEY` (required), `AGENT_MODEL` (optional).
- **No dependency changes**; no API contract change (still `POST /api/chat` → `{ text }`).
