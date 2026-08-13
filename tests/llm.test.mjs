/**
 * tests/llm.test.mjs — unit tests for the multi-provider LLM layer
 * (lib/llm.js) using a stubbed fetch (no network, no real LLM).
 *
 * Verifies provider selection, model resolution, primary→fallback behavior
 * (429 backoff and non-429 errors), the wall-clock budget cap, and
 * missing-keys handling.
 *
 * Run: node --test tests/llm.test.mjs
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { chatCompletion, hasProviderKey, resolveModel } from "../lib/llm.js";

const ORIGINAL_FETCH = globalThis.fetch;
const requests = [];

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const ZEN_URL = "https://opencode.ai/zen/v1/chat/completions";

const GEMINI_OK = {
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: "hi" } }] }),
};

const errorResponse = (status) => ({
  ok: false,
  status,
  json: async () => ({ error: { message: `stub ${status}` } }),
});

const ENV_NAMES = ["GEMINI_API_KEY", "OPENCODE_API_KEY", "LLM_PROVIDER", "AGENT_MODEL", "FAST_MODEL"];

function setEnv(env) {
  for (const name of ENV_NAMES) {
    if (env[name] === undefined) delete process.env[name];
    else process.env[name] = env[name];
  }
}

// Returns a Response-like object, or a function (url, opts) => Promise<Response>
// for tests that need to control abort behavior.
let responderFor = () => GEMINI_OK;

before(() => {
  setEnv({
    GEMINI_API_KEY: "gk",
    OPENCODE_API_KEY: "zk",
    LLM_PROVIDER: undefined,
    AGENT_MODEL: undefined,
    FAST_MODEL: undefined,
  });
  globalThis.fetch = async (url, opts) => {
    requests.push({
      url: String(url),
      headers: opts.headers,
      body: JSON.parse(opts.body),
      signal: opts.signal,
    });
    const responder = responderFor(String(url));
    return typeof responder === "function" ? responder(url, opts) : responder;
  };
});

after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  setEnv({
    GEMINI_API_KEY: undefined,
    OPENCODE_API_KEY: undefined,
    LLM_PROVIDER: undefined,
    AGENT_MODEL: undefined,
    FAST_MODEL: undefined,
  });
});

const BASE_ENV = {
  GEMINI_API_KEY: "gk",
  OPENCODE_API_KEY: "zk",
  LLM_PROVIDER: undefined,
  AGENT_MODEL: undefined,
  FAST_MODEL: undefined,
};

test("resolveModel: AGENT_MODEL > FAST_MODEL > provider default", () => {
  setEnv({ ...BASE_ENV });
  assert.equal(resolveModel({ name: "gemini" }), "gemini-3.1-flash-lite-preview");
  assert.equal(resolveModel({ name: "zen" }), "deepseek-v4-flash-free");

  setEnv({ ...BASE_ENV, FAST_MODEL: "fast-x" });
  assert.equal(resolveModel({ name: "gemini" }), "fast-x");

  setEnv({ ...BASE_ENV, FAST_MODEL: "fast-x", AGENT_MODEL: "agent-x" });
  assert.equal(resolveModel({ name: "zen" }), "agent-x");
});

test("hasProviderKey reflects configured keys", () => {
  setEnv({ ...BASE_ENV });
  assert.equal(hasProviderKey(), true);

  setEnv({ ...BASE_ENV, OPENCODE_API_KEY: undefined });
  assert.equal(hasProviderKey(), true);

  setEnv({ ...BASE_ENV, GEMINI_API_KEY: undefined, OPENCODE_API_KEY: undefined });
  assert.equal(hasProviderKey(), false);
});

test("chatCompletion: primary provider serves the completion with the default model", async () => {
  setEnv({ ...BASE_ENV, OPENCODE_API_KEY: undefined });
  requests.length = 0;
  responderFor = () => GEMINI_OK;

  const data = await chatCompletion([{ role: "user", content: "hi" }]);

  assert.equal(data.choices[0].message.content, "hi");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, GEMINI_URL);
  assert.equal(requests[0].headers.Authorization, "Bearer gk");
  assert.equal(requests[0].body.model, "gemini-3.1-flash-lite-preview");
  assert.equal(requests[0].body.messages[0].content, "hi");
});

test("chatCompletion: max_tokens and temperature are passed through", async () => {
  setEnv({ ...BASE_ENV, OPENCODE_API_KEY: undefined });
  requests.length = 0;
  responderFor = () => GEMINI_OK;

  await chatCompletion([{ role: "user", content: "x" }], { maxTokens: 8, temperature: 0 });

  assert.equal(requests[0].body.max_tokens, 8);
  assert.equal(requests[0].body.temperature, 0);
  assert.equal(requests[0].body.tools, undefined, "no tools unless requested");
});

test("chatCompletion: 429 retries with backoff on the same provider then succeeds", async () => {
  setEnv({ ...BASE_ENV, OPENCODE_API_KEY: undefined });
  requests.length = 0;
  let calls = 0;
  responderFor = () => {
    calls += 1;
    return calls < 3 ? errorResponse(429) : GEMINI_OK;
  };

  const data = await chatCompletion([{ role: "user", content: "hi" }], { backoffBaseMs: 1 });

  assert.equal(calls, 3, "initial attempt plus two 429 backoff retries");
  assert.equal(requests.length, 3);
  assert.ok(requests.every((r) => r.url === GEMINI_URL), "no fallback when backoff succeeds");
  assert.equal(data.choices[0].message.content, "hi");
});

test("chatCompletion: exhausted 429 retries fall back to Zen", async () => {
  setEnv(BASE_ENV);
  requests.length = 0;
  responderFor = (url) => (url === GEMINI_URL ? errorResponse(429) : GEMINI_OK);

  const data = await chatCompletion([{ role: "user", content: "hi" }], { backoffBaseMs: 1 });

  assert.equal(requests.filter((r) => r.url === GEMINI_URL).length, 3, "three Gemini 429 attempts");
  assert.equal(requests.filter((r) => r.url === ZEN_URL).length, 1, "one Zen fallback");
  assert.equal(requests[3].url, ZEN_URL);
  assert.equal(requests[3].body.model, "deepseek-v4-flash-free", "Zen uses its own default model");
  assert.ok(data.choices[0].message.content, "fallback completion returned");
});

test("chatCompletion: non-429 error falls back to Zen immediately", async () => {
  setEnv(BASE_ENV);
  requests.length = 0;
  responderFor = (url) => (url === GEMINI_URL ? errorResponse(500) : GEMINI_OK);

  const data = await chatCompletion([{ role: "user", content: "hi" }]);

  assert.equal(requests.length, 2, "Gemini attempt then Zen fallback");
  assert.equal(requests[0].url, GEMINI_URL);
  assert.equal(requests[1].url, ZEN_URL);
  assert.ok(data.choices[0].message.content, "fallback completion returned");
});

test("chatCompletion: exhausted budget on primary timeout prevents fallback", async () => {
  setEnv(BASE_ENV);
  requests.length = 0;
  responderFor = () => (url, opts) =>
    new Promise((_, reject) => {
      opts.signal.addEventListener("abort", () => reject(opts.signal.reason), { once: true });
    });

  await assert.rejects(
    () => chatCompletion([{ role: "user", content: "hi" }], { timeoutMs: 100 }),
    (err) => err && err.name === "AbortError",
    "aborted after the budget is exhausted"
  );
  assert.equal(requests.filter((r) => r.url === ZEN_URL).length, 0, "no fallback once the budget is gone");
});

test("chatCompletion: LLM_PROVIDER=zen makes Zen the primary provider", async () => {
  setEnv({ ...BASE_ENV, LLM_PROVIDER: "zen" });
  requests.length = 0;
  responderFor = () => GEMINI_OK;

  await chatCompletion([{ role: "user", content: "hi" }]);

  assert.equal(requests[0].url, ZEN_URL);
  assert.equal(requests[0].body.model, "deepseek-v4-flash-free");
});

test("chatCompletion: throws when no provider key is configured", async () => {
  setEnv({ ...BASE_ENV, GEMINI_API_KEY: undefined, OPENCODE_API_KEY: undefined });
  requests.length = 0;

  await assert.rejects(
    () => chatCompletion([{ role: "user", content: "hi" }]),
    /no API key set/,
    "primary provider has no key and no fallback is configured"
  );
});
