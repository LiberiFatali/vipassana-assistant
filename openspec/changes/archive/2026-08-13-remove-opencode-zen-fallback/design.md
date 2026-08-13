## Context

`lib/llm.js` currently provides a two-provider chain: Gemini (primary) and OpenCode Zen (fallback), selectable via `LLM_PROVIDER`. The fallback was added in `2026-08-13-multi-provider-llm-gemini-zen` as a safety net when Gemini was first introduced. Since then the project has standardized on Gemini's free tier (`gemini-3.1-flash-lite-preview`), the Zen fallback has never been relied upon in production, and it carries real baggage: a second secret (`OPENCODE_API_KEY`), a provider-switch env var, cross-provider fallback logic, and `FAST_MODEL` (a legacy override predating the multi-provider layer).

The call surface is exactly two `chatCompletion` call sites (`api/chat.js` and `lib/router.js`), both provider-agnostic — they never reference Zen directly. `hasProviderKey`/`warnApiKeyMissing` guard the "no key" path in `api/chat.js:218`.

## Goals / Non-Goals

**Goals:**
- Remove the OpenCode Zen provider, its key reference, and the `LLM_PROVIDER` switch.
- Drop the `FAST_MODEL` legacy override; model resolves as `AGENT_MODEL` > Gemini default.
- Keep the `PROVIDERS` registry abstraction so adding a future provider stays a one-line change.
- Keep 429 backoff and the wall-clock budget behavior intact.
- Keep the `hasProviderKey` / `warnApiKeyMissing` "no key → bilingual error" behavior (now Gemini-only).
- Remove all secret/sensitive references from committed code, tests, docs, and specs.

**Non-Goals:**
- No new provider, no SDK change, no API contract change (`POST /api/chat` → `{ text }`).
- No rotation of the `OPENCODE_API_KEY` (never committed; key leaves the machine only via `.env` deletion).
- No changes to archived `openspec/changes/archive/*` (historical records).
- No changes to the 429 backoff parameters (`BACKOFF_BASE_MS`, `MAX_429_RETRIES`).

## Decisions

### D1. Keep `PROVIDERS` registry, drop the `zen` entry
The registry stays (future-provider extensibility) but contains only `gemini`. `resolveProviders()` is replaced by returning `[PROVIDERS.gemini]`, and the `chatCompletion` provider loop becomes single-iteration — the 429 backoff still lives in `attemptProvider`, and a failed Gemini attempt now throws directly instead of falling through to Zen. Keeping the loop shape (iterate `providers`, budget-sliced per provider) means the registry can grow again without restructuring.

*Alternative considered:* collapse `chatCompletion` to a plain single fetch call. Rejected — the caller-facing signature (`messages`, `options` with `maxTokens`/`temperature`/`tools`/`timeoutMs`/`backoffBaseMs`/`signal`) and the budget/backoff machinery are used and tested; deleting them is churn with no benefit, and the registry choice preserves the "add a provider = add one object" property.

### D2. Model resolution: `AGENT_MODEL` > provider default
`resolveModel(provider)` becomes `process.env.AGENT_MODEL || PROVIDERS[name].defaultModel`, dropping `FAST_MODEL`. `FAST_MODEL` was introduced pre-multi-provider for a fast-path/tool-path model split that no longer exists (single model everywhere, per `2026-08-10-maximize-deterministic-answers-and-single-fast-model`). Tests currently assert `AGENT_MODEL > FAST_MODEL > default`; they simplify accordingly.

### D3. Drop `LLM_PROVIDER`
With one provider the switch is dead config; its only valid value was `zen`. `DEFAULT_PRIMARY` remains `"gemini"` and is now the sole provider. Rollback concerns from the original multi-provider change (`LLM_PROVIDER=zen` as rollback) are moot — removing Zen means Gemini is the only path; rolling back means redeploying the previous revision.

### D4. Env-var surface after change
- Keep: `GEMINI_API_KEY` (required), `AGENT_MODEL` (optional override).
- Remove: `OPENCODE_API_KEY`, `LLM_PROVIDER`, `FAST_MODEL`.
- `hasProviderKey()` returns `Boolean(process.env.GEMINI_API_KEY)`; `warnApiKeyMissing()` message references only `GEMINI_API_KEY`.

### D5. Tests and docs follow the removal
- `tests/llm.test.mjs`: remove `ZEN_URL`, the fallback/zen-primary/`LLM_PROVIDER` tests, and `OPENCODE_API_KEY`/`FAST_MODEL`/`LLM_PROVIDER` env wiring; rewrite `resolveModel` and `hasProviderKey` tests for the single-provider shape.
- `tests/chat-path.test.mjs`: remove the Gemini→Zen fallback test and zen-only test; drop `OPENCODE_API_KEY`/`FAST_MODEL` from the env fixture; update the no-key test to unset only `GEMINI_API_KEY`.
- `AGENTS.md` env list (lines 18–21) and request-flow descriptions; stale `api/chat.js` comments.
- `.env`: delete the `OPENCODE_API_KEY` line (local, untracked).

## Risks / Trade-offs

- **[Single provider = single point of failure]** → This was already effectively true (Gemini was primary; fallback rarely exercised). Gemini free tier is the project's deliberate choice (indefinite free, no card). If Gemini becomes unusable, the operator sets `AGENT_MODEL` or waits; re-adding a provider is a registry-entry + `resolveProviders()` change.
- **[Specs/code drift if a docs or test grep is missed]** → The "Eval caveat" greps in `AGENTS.md` (⚠️, `language="vi"`, "NEVER fill out", "Please click the link") target `lib/system-prompt.js` and router/sections — none reference Zen/`FAST_MODEL`, so they are unaffected. Final verification runs `npm test` + `npm run lint` + `openspec validate`.
- **[`FAST_MODEL` removal breaks a set-but-unused deploy env]** → If any Vercel env still sets `FAST_MODEL`, it becomes inert (ignored), not fatal. No migration needed.
- **[Provider-registry abstraction retained but only one entry]** → Slight over-abstraction accepted; it keeps future provider onboarding trivial and preserves the tested `chatCompletion` contract.

## Migration Plan

1. Implement code changes in `lib/llm.js` and `api/chat.js` comments.
2. Update tests, run `npm test` and `npm run lint`.
3. Update docs (`AGENTS.md`) and delete the `OPENCODE_API_KEY` line in local `.env`.
4. Deploy is a normal Vercel push; no schema/data migration. Remove `OPENCODE_API_KEY`/`LLM_PROVIDER`/`FAST_MODEL` from Vercel env if set (optional — inert if left).
5. Rollback: revert the commit and redeploy; previous revision still contains Zen fallback.
