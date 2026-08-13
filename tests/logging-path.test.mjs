/**
 * tests/logging-path.test.mjs — integration tests for the structured logging
 * emitted by POST /api/chat: requestId correlation, conversationId echo,
 * answer-path events, and structured errors on LLM failure.
 *
 * Run: node --test tests/logging-path.test.mjs
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { POST } from "../api/chat.js";
import { answerCache } from "../lib/answer-cache.js";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_CONSOLE = { log: console.log, warn: console.warn, error: console.error };

const capture = { log: [], warn: [], error: [] };

function lines() {
  return [...capture.log, ...capture.warn, ...capture.error].map((s) => JSON.parse(s));
}

function resetCapture() {
  capture.log.length = 0;
  capture.warn.length = 0;
  capture.error.length = 0;
}

function stubFetch(status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return status >= 200 && status < 300
        ? { choices: [{ message: { role: "assistant", content: "A curated answer." } }] }
        : { error: { message: `stub ${status}` } };
    },
  });
}

before(() => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.AGENT_MODEL = "test-model";
  answerCache.clear();
  globalThis.fetch = stubFetch(200);
  console.log = (s) => capture.log.push(s);
  console.warn = (s) => capture.warn.push(s);
  console.error = (s) => capture.error.push(s);
});

after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  console.log = ORIGINAL_CONSOLE.log;
  console.warn = ORIGINAL_CONSOLE.warn;
  console.error = ORIGINAL_CONSOLE.error;
  delete process.env.GEMINI_API_KEY;
  delete process.env.AGENT_MODEL;
});

function post(messages, extra = {}) {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, ...extra }),
    })
  );
}

test("request emits correlated start, route.decision, path.answer, request.end", async () => {
  resetCapture();
  const res = await post([{ role: "user", content: "Địa chỉ trung tâm Hà Nội?" }]);
  const data = await res.json();
  assert.ok(data.text.includes("Dhamma Virocana"), "quick answer served");

  const all = lines();
  const eventNames = all.map((l) => l.event);
  for (const name of ["request.start", "route.decision", "path.answer", "request.end"]) {
    assert.ok(eventNames.includes(name), `expected ${name} in ${eventNames}`);
  }

  const requestIds = new Set(all.map((l) => l.requestId));
  assert.equal(requestIds.size, 1, "one requestId shared across all lines");
  assert.ok(requestIds.values().next().value, "requestId present");

  const start = all.find((l) => l.event === "request.start");
  assert.equal(start.lang, "vi");
  assert.equal(start.qHash.length, 16);
  assert.equal(start.hasConversationId, false);

  const route = all.find((l) => l.event === "route.decision");
  assert.equal(route.route, "kb");

  const answer = all.find((l) => l.event === "path.answer");
  assert.equal(answer.path, "quick");
  assert.equal(typeof answer.latencyMs, "number");
  assert.equal(typeof answer.answerLen, "number");

  const end = all.find((l) => l.event === "request.end");
  assert.equal(end.outcome, "ok");
});

test("conversationId from the body is echoed into all log lines", async () => {
  resetCapture();
  const res = await post(
    [{ role: "user", content: "Địa chỉ trung tâm Hà Nội?" }],
    { conversationId: "conv-abc-123" }
  );
  const data = await res.json();
  assert.ok(data.text.includes("Dhamma Virocana"));

  const all = lines();
  assert.ok(all.length > 0, "expected log lines");
  for (const l of all) {
    assert.equal(l.conversationId, "conv-abc-123");
  }
  assert.equal(all[0].hasConversationId, true);
});

test("LLM failure emits structured error events and returns the bilingual error", async () => {
  answerCache.clear();
  resetCapture();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stubFetch(500);
  try {
    const res = await post([
      { role: "user", content: "What is the daily timetable during a 10-day course?" },
    ]);
    const data = await res.json();
    assert.ok(data.text.includes("Xin lỗi"), "bilingual error text returned");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const all = lines();
  const errorLines = all.filter((l) => l.level === "error");
  assert.ok(errorLines.length > 0, "structured error events emitted");
  const fastErr = errorLines.find(
    (l) => l.event === "fast-path.error" || l.event === "fast-retry" || l.event === "fast-timeout"
  );
  assert.ok(fastErr, "fast-path error event emitted");
  assert.equal(typeof fastErr.message, "string");

  const end = all.find((l) => l.event === "request.end");
  assert.equal(end.outcome, "error");
});
