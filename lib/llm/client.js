/**
 * lib/llm.js — OpenAI-compatible LLM access via a provider registry.
 *
 * Wraps plain fetch chat-completions against a provider registry, currently
 * holding a single entry (Google Gemini). The registry shape keeps adding a
 * future provider a one-line change. Providers speak the OpenAI
 * chat-completions contract, so request/response shapes are identical to the
 * previous multi-provider layer (payload `{ model, messages, max_tokens,
 * temperature, tools }`, response parsed as `{ choices: [{ message }] }`).
 *
 * Provider:
 *   gemini — Google AI Studio free tier, no credit card
 *            `GEMINI_API_KEY`, model `gemini-3.1-flash-lite`
 *
 * The model id is resolved per attempt as `AGENT_MODEL` > provider default.
 *
 * Attempt policy (total wall-clock capped at `timeoutMs`):
 *   1. POST the provider. On HTTP 429, retry the same provider with short
 *      exponential backoff (2^n·1s).
 *   2. On any other failure (or after backoff exhaustion), rethrow the last
 *      error so callers keep their existing timeout/error handling (e.g. the
 *      static bilingual error).
 *
 * Telemetry: emits llm.call / llm.backoff / llm.error events via lib/log.js.
 * Correlation fields (requestId, conversationId) are attached automatically
 * through AsyncLocalStorage when called inside withLogContext — no signature
 * changes required.
 */

import { logError, logInfo, logWarn, safeErr } from "../observability/log.js";
import {
  DEFAULT_GEMINI_MODEL,
  PROVIDERS,
  hasProviderKey,
  resolveModel,
  resolveProviders,
  warnApiKeyMissing,
} from "./provider.js";

export { DEFAULT_GEMINI_MODEL, hasProviderKey, resolveModel, warnApiKeyMissing };
export { PROVIDERS };

/** @typedef {import("./provider.js").Provider} Provider */

export const DEFAULT_TIMEOUT_MS = 60000;
const BACKOFF_BASE_MS = 1000;
const MAX_429_RETRIES = 2;

/**
 * @param {number} ms
 * @param {AbortSignal|undefined} signal
 * @returns {Promise<void>}
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      // @ts-ignore - resolve with void
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      // @ts-ignore
      reject(signal.reason);
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * POST a chat-completions request to one provider, retrying HTTP 429 with
 * exponential backoff while the shared budget allows. Returns the parsed
 * OpenAI-shaped body on success.
 * @param {Provider} provider
 * @param {any[]} messages
 * @param {any} options
 * @param {number} budgetMs
 * @param {number} start
 * @returns {Promise<any>}
 */
async function attemptProvider(provider, messages, options, budgetMs, start) {
  const apiKey = process.env[provider.keyEnv];
  if (!apiKey) {
    throw new Error(`LLM provider '${provider.name}' has no API key set`);
  }

  const controller = new AbortController();
  const callerSignal = options.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      throw callerSignal.reason;
    }
    callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  /** @type {Record<string, any>} */
  const payload = {
    model: resolveModel(provider),
    messages,
  };
  if (options.maxTokens !== undefined) {
    payload.max_tokens = options.maxTokens;
  }
  if (options.temperature !== undefined) {
    payload.temperature = options.temperature;
  }
  if (options.tools) {
    payload.tools = options.tools;
    payload.tool_choice = "auto";
  }

  let attempt = 0;
  for (;;) {
    const remaining = budgetMs - (Date.now() - start);
    if (remaining <= 0) {
      const err = new Error(`LLM request timed out after ${budgetMs}ms`);
      logError("llm.error", { provider: provider.name, .../** @type {any} */ (safeErr(err) || {}) });
      throw err;
    }
    if (controller.signal.aborted) {
      throw controller.signal.reason;
    }

    const callStart = Date.now();
    const timer = setTimeout(() => controller.abort(), remaining);
    let res;
    try {
      res = await fetch(provider.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      const err = new Error(`LLM API returned non-JSON (status ${res.status})`);
      logError("llm.error", {
        provider: provider.name,
        status: res.status,
        .../** @type {any} */ (safeErr(err) || {}),
      });
      throw err;
    }

    if (res.ok) {
      logInfo("llm.call", {
        provider: provider.name,
        model: payload.model,
        latencyMs: Date.now() - callStart,
        attempt,
      });
      return data;
    }

    if (res.status === 429 && attempt < MAX_429_RETRIES && !controller.signal.aborted) {
      attempt += 1;
      const base = options.backoffBaseMs ?? BACKOFF_BASE_MS;
      const delay = base * 2 ** (attempt - 1);
      if (Date.now() + delay < start + budgetMs) {
        logWarn("llm.backoff", {
          provider: provider.name,
          status: res.status,
          attempt,
          delayMs: delay,
        });
        await sleep(delay, controller.signal);
        continue;
      }
    }

    const err = new Error(`LLM API error ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    logError("llm.error", {
      provider: provider.name,
      status: res.status,
      .../** @type {any} */ (safeErr(err) || {}),
    });
    throw err;
  }
}

/**
 * POST a chat-completions request across the provider chain.
 *
 * @param {any[]} messages OpenAI-style `{ role, content }` messages.
 * @param {object} [options]
 * @param {number} [options.maxTokens]   Maps to `max_tokens` in the payload.
 * @param {number} [options.temperature]
 * @param {any[]}  [options.tools]       OpenAI function-tool schemas (opt-in).
 * @param {number} [options.timeoutMs]   Total wall-clock budget across all attempts.
 * @param {number} [options.backoffBaseMs] Base delay for 429 backoff (tests inject small values).
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ choices: any[] }>} Parsed OpenAI-compatible body.
 */
export async function chatCompletion(messages, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();
  const providers = resolveProviders();

  /** @type {unknown} */
  let lastError = null;
  for (const provider of providers) {
    const budgetMs = timeoutMs - (Date.now() - start);
    if (budgetMs <= 0) {
      break;
    }
    try {
      return await attemptProvider(provider, messages, options, budgetMs, start);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("LLM request failed: no providers configured");
}
