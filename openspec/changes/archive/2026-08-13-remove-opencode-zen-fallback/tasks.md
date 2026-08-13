## 1. lib/llm.js — remove OpenCode Zen fallback

- [x] 1.1 Remove the `zen` entry from `PROVIDERS` (url, `keyEnv`, `defaultModel`) and remove its comment block; keep the `gemini` entry.
- [x] 1.2 Remove `LLM_PROVIDER` handling and `resolveProviders()`; return `[PROVIDERS.gemini]` as the sole provider chain.
- [x] 1.3 Drop `FAST_MODEL` from `resolveModel()` — resolve as `AGENT_MODEL` > provider default.
- [x] 1.4 Simplify `hasProviderKey()` to check only `GEMINI_API_KEY`.
- [x] 1.5 Update `warnApiKeyMissing()` message to reference only `GEMINI_API_KEY`.
- [x] 1.6 Update the module doc-comment: provider order, model resolution, and attempt policy now single-provider (no Zen, no fallback).

## 2. api/chat.js — stale comments

- [x] 2.1 Update comments referencing "OpenCode Zen fallback" / "Zen endpoint" (lines ~7, 10, 34, 209) to describe the Gemini-only provider via `lib/llm.js`.

## 3. Tests

- [x] 3.1 `tests/llm.test.mjs`: remove `ZEN_URL`, the fallback tests (exhausted 429→Zen, non-429→Zen, `LLM_PROVIDER=zen`), and `OPENCODE_API_KEY`/`FAST_MODEL`/`LLM_PROVIDER` from env wiring; rewrite `resolveModel` and `hasProviderKey` tests for the single-provider shape; assert a Gemini-only request and that exhausted 429 budget propagates the failure.
- [x] 3.2 `tests/chat-path.test.mjs`: remove the Gemini→Zen fallback test and the zen-only test; drop `OPENCODE_API_KEY` and `FAST_MODEL` from the env fixture; update the no-key test to unset only `GEMINI_API_KEY`.

## 4. Docs

- [x] 4.1 `AGENTS.md`: update the env-var list (remove `OPENCODE_API_KEY`, `LLM_PROVIDER`, `FAST_MODEL`) and the request-flow descriptions to describe the Gemini-only path.
- [x] 4.2 `.env`: delete the `OPENCODE_API_KEY` line (local, untracked) and fix any stale model comment.

## 5. Verification

- [x] 5.1 Run `npm test` and `npm run lint` — all pass.
- [x] 5.2 Run `openspec validate` on the change and confirm no lint errors in the delta specs.