/**
 * tests/chat-path.test.mjs — integration tests for the request path in
 * api/chat.js using a stubbed fetch (no network, no real LLM).
 *
 * Verifies:
 *  - knowledge-only questions take the fast path: one LLM call, no `tools`
 *    attached, trimmed knowledge prompt;
 *  - live-schedule questions take the tool path: `tools` attached, full
 *    knowledge base injected;
 *  - ambiguous questions flow through the LLM classifier.
 *
 * Run: node --test tests/chat-path.test.mjs
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { POST } from "../api/chat.js";
import { answerCache } from "../lib/answer-cache.js";

const ORIGINAL_FETCH = globalThis.fetch;
const requests = [];

const FAKE_RESPONSE = {
  ok: true,
  status: 200,
  async json() {
    return {
      choices: [{ message: { role: "assistant", content: "A curated answer." } }],
    };
  },
};

before(() => {
  process.env.OPENCODE_API_KEY = "test-key";
  process.env.AGENT_MODEL = "test-model";
  process.env.FAST_MODEL = "test-fast-model";
  answerCache.clear();
  globalThis.fetch = async (url, opts) => {
    requests.push({ url: String(url), body: JSON.parse(opts.body) });
    return FAKE_RESPONSE;
  };
});

after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.OPENCODE_API_KEY;
  delete process.env.AGENT_MODEL;
  delete process.env.FAST_MODEL;
});

function post(messages) {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    })
  );
}

test("fast path: knowledge-only question sends no tools and a trimmed prompt", async () => {
  requests.length = 0;
  const res = await post([
    { role: "user", content: "What is the daily timetable during a 10-day course?" },
  ]);
  const data = await res.json();

  assert.equal(data.text, "A curated answer.");
  assert.equal(requests.length, 1, "single LLM call on the fast path");

  const body = requests[0].body;
  assert.equal(body.model, "test-model", "single model is used on the fast path");
  assert.equal(body.tools, undefined, "no tools attached on the fast path");
  assert.equal(body.tool_choice, undefined, "no tool_choice on the fast path");

  const system = body.messages[0].content;
  assert.ok(system.includes("THE DAILY TIMETABLE"), "trimmed knowledge section is present");
  assert.ok(!system.includes("## 6-VI."), "full knowledge base is not injected");
});

test("tool path: live-schedule question uses pure composer with pre-fetched schedule context and no tools", async () => {
  requests.length = 0;
  const res = await post([
    { role: "user", content: "Khóa thiền 10 ngày hết chỗ chưa?" },
  ]);
  const data = await res.json();

  assert.equal(data.text, "A curated answer.");
  assert.equal(requests.length, 1, "single composer call when live context is injected");

  const body = requests[0].body;
  assert.equal(body.tools, undefined, "no tools attached on pure composer path");
  assert.equal(body.tool_choice, undefined, "no tool_choice on pure composer path");

  const system = body.messages[0].content;
  assert.ok(system.includes("Live Course Schedule Context"), "live schedule context is pre-fetched and injected");
});

test("ambiguous question flows through the LLM classifier before answering", async () => {
  requests.length = 0;
  const res = await post([{ role: "user", content: "khóa thiền" }]);
  const data = await res.json();

  assert.equal(data.text, "A curated answer.");
  // The stub's classifier response ("A curated answer.") does not start with
  // TOOLS, so the router settles on the KB fast path: classifier call + answer.
  assert.equal(requests.length, 2, "classifier call then fast-path answer");
});

test("deterministic address question makes no LLM call", async () => {
  requests.length = 0;
  const res = await post([{ role: "user", content: "Địa chỉ trung tâm Hà Nội?" }]);
  const data = await res.json();

  assert.ok(data.text.includes("Dhamma Virocana"), "deterministic center info served");
  assert.equal(requests.length, 0, "no LLM call for a deterministic quick-answer");
});

test("out-of-scope question returns the static fallback with no LLM call", async () => {
  requests.length = 0;
  const res = await post([{ role: "user", content: "Cho tôi hỏi nhóm thiền ở Hà Nội?" }]);
  const data = await res.json();

  assert.ok(data.text.includes("info@ucenlist.org"), "fallback mentions the contact email");
  assert.ok(data.text.includes("ban quản trị"), "fallback mentions the admin team");
  assert.equal(requests.length, 0, "no LLM call for an out-of-scope question");
});

test("in-scope question still hits the LLM (out-of-scope gate does not interfere)", async () => {
  answerCache.clear();
  requests.length = 0;
  const res = await post([{ role: "user", content: "What is the daily timetable during a 10-day course?" }]);
  const data = await res.json();

  assert.equal(data.text, "A curated answer.");
  assert.equal(requests.length, 1, "in-scope question reaches the LLM");
});

test("repeated generative question is served from the answer cache", async () => {
  requests.length = 0;
  await post([{ role: "user", content: "Tell me about S.N. Goenka's biography." }]);
  assert.equal(requests.length, 1, "first ask hits the LLM");

  requests.length = 0;
  await post([{ role: "user", content: "Tell me about S.N. Goenka's biography." }]);
  assert.equal(requests.length, 0, "second ask is served from cache");
});
