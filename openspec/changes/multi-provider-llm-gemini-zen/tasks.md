# Tasks

## 1. Spike

- [x] 1.1 Verify `gemini-3.1-flash-lite-preview` responds on the Gemini OpenAI-compatible endpoint with a one-line `curl` (Bearer `GEMINI_API_KEY`, `max_tokens` accepted). Result: `gemini-2.5-flash-lite` is 404 for new users; `gemini-2.5-flash` burns the classifier budget at `max_tokens: 8` (returns `"K"`, finish `length`); locked `DEFAULT_MODEL` to `gemini-3.1-flash-lite-preview` — verified, answers the classifier correctly at `max_tokens: 8`, 15 RPM.

## 2. Core Implementation

- [x] 2.1 Create `lib/llm.js`: provider table (`gemini`, `zen`), `chatCompletion(messages, { maxTokens, temperature, timeoutMs, signal })`, `resolveModel(provider)`, `hasProviderKey()`, and a missing-key warning helper.
- [x] 2.2 Implement the attempt policy in `lib/llm.js`: primary POST → `429` backoff retries (`2^n·1s`, n=0,1) → one fallback attempt → rethrow last error; total wall-clock capped at `timeoutMs` (default 60000), aborted on caller signal.
- [x] 2.3 Rewire `api/chat.js`: `callChatCompletion` delegates to `lib/llm.js`; delete local `LLM_CHAT_URL`/`resolveModel`; replace the `OPENCODE_API_KEY` gate with "no provider key present" using the shared warning.
- [x] 2.4 Rewire `lib/router.js`: `classifyWithLLM` delegates to `lib/llm.js` (`maxTokens: 8`, `temperature: 0`, 2.5s budget); remove local URL/fetch; treat empty classifier content as the tools path (conservative).

## 3. Tests

- [x] 3.1 Add `tests/llm.test.mjs`: provider resolution, `AGENT_MODEL`/default model resolution, 429 backoff → success, 429 exhaustion → fallback, non-429 failure → fallback, budget capping, both-keys-missing behavior (stubbed `fetch`).
- [x] 3.2 Update `tests/chat-path.test.mjs`: set `GEMINI_API_KEY`/`AGENT_MODEL`; assert the Gemini URL + model on requests; add a fallback test (Gemini `500` → second request to the Zen URL); add a Zen-only test (`OPENCODE_API_KEY` only → Zen URL).
- [x] 3.3 Confirm `tests/router.test.mjs` and the remaining suites stay green unchanged.

## 4. Specs and Docs

- [x] 4.1 Update `README.md`: env vars (`GEMINI_API_KEY` required, `OPENCODE_API_KEY` fallback, `LLM_PROVIDER`), setup/deploy commands, architecture note for `lib/llm.js`, free-tier data-sharing note.
- [x] 4.2 Update `AGENTS.md`: env contract, architecture tree (`lib/llm.js`), request-flow description (provider primary/fallback), security model note that domain gating is unaffected.
- [x] 4.3 Add `GEMINI_API_KEY` to `.env` locally and `vercel env add GEMINI_API_KEY` for production (keep `OPENCODE_API_KEY`).

## 5. Verification

- [x] 5.1 Run `npm test` — all suites pass (183 pass).
- [x] 5.2 Manual `npm run dev` with both keys: English + Vietnamese turn, live course lookup, cache hit, forced fallback (unset `GEMINI_API_KEY`), and `LLM_PROVIDER=zen` reverts to Zen-only.
- [x] 5.3 Confirm `find api -name '*.js'` returns exactly `api/chat.js`.