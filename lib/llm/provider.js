import { logError } from "../observability/log.js";

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";

/**
 * @typedef {object} Provider
 * @property {string} name
 * @property {string} url
 * @property {string} keyEnv
 * @property {string} defaultModel
 */

/** @type {Record<string, Provider>} */
export const PROVIDERS = {
  gemini: {
    name: "gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
    defaultModel: DEFAULT_GEMINI_MODEL,
  },
};

export const DEFAULT_PRIMARY = "gemini";

let _apiKeyMissingLogged = false;

/**
 * Resolve the model id for a provider (AGENT_MODEL > provider default).
 * @param {Provider|null|undefined} provider
 * @returns {string}
 */
export function resolveModel(provider) {
  const name = provider && provider.name ? provider.name : DEFAULT_PRIMARY;
  return process.env.AGENT_MODEL || /** @type {Provider} */ (PROVIDERS[name]).defaultModel;
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
export function resolveProviders() {
  return [PROVIDERS[DEFAULT_PRIMARY]];
}
