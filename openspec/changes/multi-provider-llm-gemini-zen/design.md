## Context

The agent's LLM surface is exactly two OpenAI-shaped chat-completions call sites: `callChatCompletion` in `api/chat.js` (fast path + pure-composer path) and `classifyWithLLM` in `lib/router.js` (tiny intent classifier, `max_tokens: 8`, `temperature: 0`, 2.5s budget). Both POST to `https://opencode.ai/zen/v1/chat/completions` with `Authorization: Bearer ${OPENCODE_API_KEY}` and a single resolved model id (`AGENT_MODEL` > `FAST_MODEL` > `deepseek-v4-flash-free`).

OpenCode Zen free tier has been the project's recurring reliability bottleneck (archived changes: `kb-response-latency` 5–12s TTFT, `fix-reasoning-model-timeouts` reasoning-model stalls, `streaming-response` added then removed). Google AI Studio offers an indefinite free Gemini tier (no credit card, no expiry) reachable through an OpenAI-compatible endpoint, so the existing payload shape — `messages`, `model`, `max_tokens`, `temperature` — works without an SDK.

## Goals / Non-Goals

**Goals:**
- Make Gemini the primary LLM provider (default model `gemini-3.1-flash-lite-preview`), with OpenCode Zen as an automatic fallback.
- Keep both existing call sites (composer + classifier) unchanged in response parsing (`choices[0].message`).
- Survive Gemini free-tier `429` rate limits via backoff, then provider fallback.
- Keep every fast-path invariant: no tools attached on fast path, output still passes through `sanitize_urls()`.

**Non-Goals:**
- Native Gemini `generateContent` API — the OpenAI-compat endpoint avoids a second payload shape for zero benefit (tools are not currently attached anywhere).
- Adding SDK dependencies (`openai`, `@google/genai`) — plain `fetch` is already proven here and keeps the deployment lean.
- Reviving the dormant tool loop (`TOOLS` registry) — out of scope; `tools` is passed through if a future caller needs it.

## Decisions

### D1. `lib/llm.js` exposes `chatCompletion(messages, options)` returning the parsed OpenAI-shaped body

`options`: `{ maxTokens, temperature, timeoutMs, signal }`. Returns the full parsed JSON (`{ choices: [...] }`) so `api/chat.js` and `lib/router.js` keep their existing `data.choices[0].message` extraction. Single point for URL, key, model resolution, retry, and fallback.

### D2. Provider table + `LLM_PROVIDER` ordering

```
gemini: { url: ".../v1beta/openai/chat/completions", keyEnv: "GEMINI_API_KEY",   defaultModel: "gemini-3.1-flash-lite-preview" }
zen:    { url: ".../zen/v1/chat/completions",          keyEnv: "OPENCODE_API_KEY", defaultModel: "deepseek-v4-flash-free" }
```

`PRIMARY = env.LLM_PROVIDER || "gemini"`; fallback is the other provider, used only if its key is present. `resolveModel(provider) = AGENT_MODEL > FAST_MODEL > provider.defaultModel` — a user-set `AGENT_MODEL` applies to whichever provider is active. `LLM_PROVIDER=zen` reproduces today's behavior instantly (rollback switch).

### D3. Attempt policy: backoff on 429, then fallback, total budget capped at `timeoutMs`

Ordered attempts against `[primary, fallback]`:
1. POST primary. On `429` → sleep `2^n·1s` (n = 0, 1) and retry the same provider (Gemini free limits reset within ~60s).
2. On any other failure (or after backoff exhaustion) → one attempt on the fallback provider if configured.
3. All fail → rethrow the last error; callers keep their existing timeout/error text handling.

The wall-clock total is tracked against `timeoutMs` (default `60_000`, matching Vercel `maxDuration`); retries/fallback are skipped once the budget is exhausted. This is essential for the classifier's 2.5s budget — a slow primary must not burn the whole budget before a fallback attempt.

### D4. Empty classifier output resolves to `tools`

The classifier's `max_tokens: 8` can be consumed entirely by a thinking model's internal tokens, yielding empty `content`. Today empty → `kb`, which violates the documented conservative bias ("never wrong data"). Empty is now treated as a failure → `tools` (extra latency, never stale data), matching the existing timeout behavior.

*Alternative considered:* raising `CLASSIFIER_MAX_TOKENS`. Rejected — it widens the latency budget without fixing the ambiguity; the conservative default is strictly safer.

### D5. Key gate moves into `lib/llm.js`

`generateAgentResponse` currently short-circuits when `OPENCODE_API_KEY` is absent. It now requires *any* configured provider key; the once-per-cold-start warning fires only when both keys are missing. No key → same bilingual `ERROR_RESPONSE_TEXT`.

## Risks / Trade-offs

- **[`gemini-2.5-flash-lite` unavailable on the OpenAI-compat endpoint]** → **Resolved by spike**: the 2.5 lite line returns 404 for new users; `gemini-2.5-flash` burns the classifier's `max_tokens: 8` budget on thinking (returns `"K"`, finish `length`). Default locked to `gemini-3.1-flash-lite-preview` (answers the classifier at `max_tokens: 8`, 15 RPM). If it is deprecated later, flip the constant in `lib/llm.js` — `AGENT_MODEL` and the Zen fallback cover the interim.
- **[Gemini free tier 429s under bursts]** → Backoff (2^n·1s) plus Zen fallback; app-level per-IP limiter (20/min) already guards; most traffic short-circuits deterministically before any LLM call.
- **[Free tier shares prompt data with Google for training]** → Accepted by the user (free AI Studio tier); note it in README so future maintainers see the trade-off.
- **[Fallback doubles worst-case latency]** → Total budget capped at `timeoutMs` across all attempts; fallback gets only the remaining time.
- **[`AGENT_MODEL` override names a model the fallback provider lacks]** → Documented; on failure the request degrades to the static bilingual error, same as today.
- **[Classifier regresses if Gemini behaves differently (e.g. `max_tokens` ignored on some Gemini versions)]** → D4 (empty → tools) converts the failure mode into the conservative path.

## Migration Plan

1. Deploy order: add `GEMINI_API_KEY` to Vercel env, keep `OPENCODE_API_KEY`. `LLM_PROVIDER` defaults to `gemini`, so the new provider is live on next deploy without config changes.
2. Rollback: set `LLM_PROVIDER=zen` (or unset `GEMINI_API_KEY`) and redeploy — behavior returns to today's Zen-only path; code can stay deployed.
3. Verify: `npm test`, then `vercel dev` with both keys: EN + VI turn, live schedule, cache hit, forced fallback (unset `GEMINI_API_KEY`), and forced backoff (429 stub).

## Open Questions

- None blocking — the spike confirmed `gemini-3.1-flash-lite-preview` on the OpenAI-compat endpoint with `max_tokens: 8` (classifier) and unbounded composer calls. It is a preview model; the constant flip + `AGENT_MODEL` override are the escape hatch if Google deprecates it.