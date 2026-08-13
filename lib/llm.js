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

import { logError, logInfo, logWarn, safeErr } from "./log.js";

// Free-tier model availability changes over time; the default is picked to be
// cheap and reliable today and is overridable via AGENT_MODEL.
//
// Verified live (2026-08): `gemini-2.5-flash-lite` is no longer offered to new
// users; `gemini-2.5-flash` burns the classifier's tiny `max_tokens` budget on
// thinking (returns "K"/length, not a full TOOLS/KNOWLEDGE word); the current
// lite model is `gemini-3.1-flash-lite-preview`, which answers the classifier
// correctly at `max_tokens: 8` and has the most generous free RPM (15).
const PROVIDERS = {
  gemini: {
    name: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-3.1-flash-lite-preview",
  },
};

const DEFAULT_PRIMARY = "gemini";
export const DEFAULT_TIMEOUT_MS = 60000;
const BACKOFF_BASE_MS = 1000;
const MAX_429_RETRIES = 2;

let _apiKeyMissingLogged = false;

/** Resolve the model id for a provider (AGENT_MODEL > provider default). */
export function resolveModel(provider) {
  const name = provider && provider.name ? provider.name : DEFAULT_PRIMARY;
  return process.env.AGENT_MODEL || PROVIDERS[name].defaultModel;
}

/** True when the provider API key is configured. */
export function hasProviderKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Log a missing-key warning once per cold start. */
export function warnApiKeyMissing() {
  if (!_apiKeyMissingLogged) {
    _apiKeyMissingLogged = true;
    logError("llm.key-missing", {
      name: "Error",
      message:
        "No LLM provider key is set (GEMINI_API_KEY) — all requests will return an error.",
    });
  }
}

/** The provider chain for this process — currently the single Gemini provider. */
function resolveProviders() {
  return [PROVIDERS[DEFAULT_PRIMARY]];
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * POST a chat-completions request to one provider, retrying HTTP 429 with
 * exponential backoff while the shared budget allows. Returns the parsed
 * OpenAI-shaped body on success.
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
      logError("llm.error", { provider: provider.name, ...safeErr(err) });
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
        ...safeErr(err),
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
      ...safeErr(err),
    });
    throw err;
  }
}

/**
 * POST a chat-completions request across the provider chain.
 *
 * @param {Array} messages OpenAI-style `{ role, content }` messages.
 * @param {Object} [options]
 * @param {number} [options.maxTokens]   Maps to `max_tokens` in the payload.
 * @param {number} [options.temperature]
 * @param {Array}  [options.tools]       OpenAI function-tool schemas (opt-in).
 * @param {number} [options.timeoutMs]   Total wall-clock budget across all attempts.
 * @param {number} [options.backoffBaseMs] Base delay for 429 backoff (tests inject small values).
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ choices: Array }>} Parsed OpenAI-compatible body.
 */
export async function chatCompletion(messages, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const start = Date.now();
  const providers = resolveProviders();

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