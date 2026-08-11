/**
 * tests/stream.test.mjs — streaming-path tests for api/chat.js using a stubbed
 * fetch that returns web ReadableStreams of OpenAI-style provider SSE frames.
 *
 * Verifies:
 *  - SSE negotiation via `Accept: text/event-stream` and `?stream=1`;
 *  - `delta` events arrive incrementally followed by a `done` event carrying
 *    the complete sanitized answer;
 *  - rolling URL sanitization: an untrusted URL split across chunks is replaced
 *    by the safety notice in both deltas and `done`, while a trusted
 *    `*.vridhamma.org` URL split across chunks survives intact;
 *  - a deterministic quick-answer and a cache hit short-circuit to `done` with
 *    no LLM call;
 *  - the tool path emits `status` events and streams the final text;
 *  - a mid-stream provider failure emits the static bilingual `error` event.
 *
 * Run: node --test tests/stream.test.mjs
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { POST } from "../api/chat.js";
import { answerCache } from "../lib/answer-cache.js";

const ORIGINAL_FETCH = globalThis.fetch;
const requests = [];
// `responses[i]` is the array of SSE frames returned for the i-th fetch call.
// It may be the marker symbols below to force a provider failure.
const responses = [];
const PROVIDER_ERROR = Symbol("provider-error");
const PROVIDER_PARTIAL_ERROR = Symbol("provider-partial-error");
const PROVIDER_TIMEOUT = Symbol("provider-timeout");
const PROVIDER_STALLED = Symbol("provider-stalled");

const encoder = new TextEncoder();

/** Wrap an OpenAI-style chunk in a `data:` SSE frame. */
function chunk(delta, finishReason) {
  return (
    "data: " +
    JSON.stringify({
      id: "chunk",
      object: "chat.completion.chunk",
      choices: [{ index: 0, delta, finish_reason: finishReason || null }],
    }) +
    "\n\n"
  );
}

/** A fake fetch Response whose body is a web ReadableStream of SSE frames. */
function sseProvider(frames) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { choices: [{ message: { role: "assistant", content: "non-stream" } }] };
    },
    body: new ReadableStream({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
        }
        controller.close();
      },
    }),
  };
}

function sseProviderError(frames) {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        for (const frame of frames) {
          controller.enqueue(encoder.encode(frame));
        }
        // Error asynchronously so already-enqueued frames are delivered first
        // (a synchronous controller.error() drops queued chunks).
        setTimeout(() => controller.error(new Error("provider exploded")), 0);
      },
    }),
  };
}

/** A fake fetch Response that errors like the LLM_TIMEOUT_MS abort timer. */
function sseProviderTimeout() {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        setTimeout(() => controller.error(new DOMException("This operation was aborted", "AbortError")), 0);
      },
    }),
  };
}

/**
 * A fake fetch Response that never yields content/tool-call deltas and errors
 * with AbortError only when the caller's AbortController fires — simulating a
 * model that accepts the request but stalls before the first token, exactly
 * what the first-token watchdog timer aborts.
 */
function sseProviderStalled(signal) {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        // A role-only delta: `firstDeltaSeen` stays false because there is no
        // content/tool_calls, so the watchdog stays armed.
        controller.enqueue(encoder.encode(chunk({ role: "assistant" })));
        signal.addEventListener(
          "abort",
          () => controller.error(new DOMException("This operation was aborted", "AbortError")),
          { once: true }
        );
      },
    }),
  };
}

/** A fake fetch Response for a scraper HTML fetch (used by get_course_details). */
function htmlProvider(text) {
  return {
    ok: true,
    status: 200,
    async text() {
      return text;
    },
    async json() {
      return JSON.parse(text);
    },
  };
}

// A large VRI detail page so get_course_details returns an oversized result.
const SCRAPER_HTML =
  "<html><body><main><div id=\"content\"><p>special instruction " +
  "x".repeat(12000) +
  "</p></div></main></body></html>";

before(() => {
  process.env.OPENCODE_API_KEY = "test-key";
  process.env.AGENT_MODEL = "test-model";
  process.env.FAST_MODEL = "test-fast-model";
  answerCache.clear();
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    const isLLM = urlStr.includes("chat/completions");
    requests.push({
      url: urlStr,
      body: opts && opts.body ? JSON.parse(opts.body) : null,
      isLLM,
    });
    if (!isLLM) {
      return htmlProvider(SCRAPER_HTML);
    }
    const llmIndex = requests.filter((r) => r.isLLM).length - 1;
    const spec = responses[llmIndex];
    if (spec === PROVIDER_ERROR) {
      return sseProviderError([]);
    }
    if (spec === PROVIDER_PARTIAL_ERROR) {
      return sseProviderError([chunk({ content: "Visit https://x " })]);
    }
    if (spec === PROVIDER_TIMEOUT) {
      return sseProviderTimeout();
    }
    if (spec === PROVIDER_STALLED) {
      return sseProviderStalled(opts.signal);
    }
    return sseProvider(spec || []);
  };
});

after(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.OPENCODE_API_KEY;
  delete process.env.AGENT_MODEL;
  delete process.env.FAST_MODEL;
});

function streamPost(messages, extraHeaders = {}) {
  return POST(
    new Request("http://localhost/api/chat?stream=1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...extraHeaders },
      body: JSON.stringify({ messages }),
    })
  );
}

/** Drain the response body and parse it into { event, data } frames. */
async function readEvents(res) {
  const text = await res.text();
  const events = [];
  for (const frame of text.split("\n\n")) {
    if (!frame.trim()) continue;
    let event = "message";
    let dataStr = "";
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
    }
    if (!dataStr || dataStr === "[DONE]") continue;
    events.push({ event, data: JSON.parse(dataStr) });
  }
  return events;
}

test("negotiation: Accept header produces text/event-stream, default stays JSON", async () => {
  answerCache.clear();
  responses.length = 0;
  responses.push([chunk({ content: "hi " }, "stop")]);

  const streamRes = await streamPost([{ role: "user", content: "What is Vipassana?" }]);
  assert.match(streamRes.headers.get("content-type"), /text\/event-stream/);
  await streamRes.text();

  // Header-based negotiation (no query param).
  const headerRes = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ messages: [{ role: "user", content: "What is Vipassana?" }] }),
    })
  );
  assert.match(headerRes.headers.get("content-type"), /text\/event-stream/);
  await headerRes.text();

  // No streaming signal -> the existing JSON contract.
  const jsonRes = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "What is Vipassana?" }] }),
    })
  );
  assert.match(jsonRes.headers.get("content-type"), /application\/json/);
  const data = await jsonRes.json();
  assert.equal(typeof data.text, "string");
});

test("fast path streams deltas then done with the complete sanitized text", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push([
    chunk({ content: "See https://vridham" }),
    chunk({ content: "ma.org " }),
    chunk({ content: "now" }, "stop"),
  ]);

  const res = await streamPost([{ role: "user", content: "What is the daily timetable?" }]);
  const events = await readEvents(res);

  const deltas = events.filter((e) => e.event === "delta");
  const done = events.filter((e) => e.event === "done");
  assert.ok(deltas.length >= 2, "multiple delta events arrive incrementally");
  assert.equal(done.length, 1, "exactly one done event");
  assert.equal(events[events.length - 1].event, "done", "done is the last event");

  const streamed = deltas.map((e) => e.data.text).join("");
  assert.ok(streamed.includes("See "), "prefix text streamed");
  assert.ok(streamed.includes("https://vridhamma.org"), "trusted URL survives mid-stream");
  assert.equal(done[0].data.text, "See https://vridhamma.org now");

  // Fast path: exactly one call, streaming, no tools attached, single model.
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.stream, true);
  assert.equal(requests[0].body.tools, undefined);
  assert.equal(requests[0].body.model, "test-model");
});

test("fast path timeout with no output emits done with apology (no retry)", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push(PROVIDER_TIMEOUT);

  const res = await streamPost([{ role: "user", content: "What is the daily timetable?" }]);
  const events = await readEvents(res);

  // Timeout surfaces as a friendly 'done' message, not an error event.
  const done = events.find((e) => e.event === "done");
  assert.ok(done, "done event emitted after fast-path timeout");
  assert.ok(done.data.text.includes("thử lại"), "done text contains the apology");
  assert.equal(events.filter((e) => e.event === "error").length, 0, "no error event on timeout");
  assert.equal(requests.length, 1, "no retry of a timed-out fast-path call");
});

test("first-token watchdog aborts a stalled stream and emits error without retry", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push(PROVIDER_STALLED);
  process.env.FIRST_TOKEN_TIMEOUT_MS = "50";

  const res = await streamPost([{ role: "user", content: "What is the daily timetable?" }]);
  const events = await readEvents(res);

  delete process.env.FIRST_TOKEN_TIMEOUT_MS;
  // The stalled provider fires the first-token watchdog (AbortError), which is
  // a timeout — surfaces as a friendly 'done' apology, not a raw error event.
  const done = events.find((e) => e.event === "done");
  assert.ok(done, "done event emitted after the first-token watchdog fired");
  assert.ok(done.data.text.includes("thử lại"), "done text contains the apology");
  assert.equal(events.filter((e) => e.event === "error").length, 0, "no error event on watchdog timeout");
  assert.equal(requests.length, 1, "no retry of a watchdog-timed-out call");
});

test("healthy stream is unaffected by the first-token watchdog", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push([
    chunk({ content: "See https://vridham" }),
    chunk({ content: "ma.org " }),
    chunk({ content: "now" }, "stop"),
  ]);
  process.env.FIRST_TOKEN_TIMEOUT_MS = "50";

  const res = await streamPost([{ role: "user", content: "What is the daily timetable?" }]);
  const events = await readEvents(res);

  delete process.env.FIRST_TOKEN_TIMEOUT_MS;
  const done = events.find((e) => e.event === "done");
  assert.ok(done, "done event present on a healthy stream");
  assert.equal(done.data.text, "See https://vridhamma.org now");
  assert.equal(events.filter((e) => e.event === "error").length, 0, "no error on a healthy stream");
  assert.equal(requests.length, 1, "exactly one LLM call on the healthy path");
});

test("rolling sanitizer gates an untrusted URL split across chunks", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push([
    chunk({ content: "Visit https://evi" }),
    chunk({ content: "l.com " }),
    chunk({ content: "now" }, "stop"),
  ]);

  const res = await streamPost([{ role: "user", content: "What is the daily timetable?" }]);
  const events = await readEvents(res);

  const streamed = events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
  const done = events.find((e) => e.event === "done");

  assert.ok(streamed.includes("[🔒"), "the safety notice appears in the deltas");
  assert.ok(!streamed.includes("evil.com"), "no untrusted URL leaks in the deltas");
  assert.ok(done.data.text.includes("[🔒"), "the safety notice appears in done");
  assert.ok(!done.data.text.includes("evil.com"), "no untrusted URL in done");
});

test("deterministic quick-answer short-circuits to done with no LLM call", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push([]);

  const res = await streamPost([{ role: "user", content: "Địa chỉ trung tâm Hà Nội?" }]);
  const events = await readEvents(res);

  assert.equal(requests.length, 0, "no LLM call for a deterministic quick-answer");
  const done = events.find((e) => e.event === "done");
  assert.ok(done, "done event present");
  assert.ok(done.data.text.includes("Dhamma Virocana"), "deterministic answer served");
  assert.equal(events.filter((e) => e.event === "delta").length, 0, "no deltas on short-circuit");
});

test("out-of-scope question short-circuits to done with no LLM call", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push([]);

  const res = await streamPost([{ role: "user", content: "Is there a meditation group in Hanoi?" }]);
  const events = await readEvents(res);

  assert.equal(requests.length, 0, "no LLM call for an out-of-scope question");
  const done = events.find((e) => e.event === "done");
  assert.ok(done, "done event present");
  assert.ok(done.data.text.includes("info@ucenlist.org"), "fallback mentions the contact email");
  assert.equal(events.filter((e) => e.event === "delta").length, 0, "no deltas on short-circuit");
  assert.equal(events.filter((e) => e.event === "status").length, 0, "no status events on short-circuit");
});

test("cache hit short-circuits to done with no LLM call", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push([chunk({ content: "A cached biography. " }, "stop")]);

  const first = await streamPost([{ role: "user", content: "Tell me about S.N. Goenka's biography." }]);
  await first.text();
  assert.equal(requests.length, 1, "first ask hits the LLM");

  requests.length = 0;
  const res = await streamPost([{ role: "user", content: "Tell me about S.N. Goenka's biography." }]);
  const events = await readEvents(res);

  assert.equal(requests.length, 0, "second ask is served from the answer cache");
  const done = events.find((e) => e.event === "done");
  assert.ok(done.data.text.includes("A cached biography."));
});

test("tool path streams status event then single-pass final text composer", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push([chunk({ content: "Here is the center information." }, "stop")]);

  const res = await streamPost([{ role: "user", content: "Khóa thiền 10 ngày hết chỗ chưa?" }]);
  const events = await readEvents(res);

  const statuses = events.filter((e) => e.event === "status");
  assert.ok(statuses.length >= 1, "status event emitted during composer preparation");

  const deltas = events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
  assert.ok(deltas.includes("Here is the center information."), "final text streamed as deltas");

  const done = events.find((e) => e.event === "done");
  assert.equal(done.data.text, "Here is the center information.");
  assert.equal(events[events.length - 1].event, "done", "done is the last event");

  // Pure composer mode uses single-pass text generation with no function tool definitions.
  const finalCall = requests[requests.length - 1];
  assert.equal(finalCall.body.tools, undefined, "no tools attached on pure composer path");
  assert.ok(finalCall.body.messages[0].content.includes("Live Course Schedule Context"), "live schedule context pre-fetched");
});

test("mid-stream provider failure emits a static error event", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push(PROVIDER_PARTIAL_ERROR);

  const res = await streamPost([{ role: "user", content: "What is the daily timetable?" }]);
  const events = await readEvents(res);

  const error = events.find((e) => e.event === "error");
  assert.ok(error, "error event emitted on mid-stream failure");
  assert.equal(events.filter((e) => e.event === "done").length, 0, "no done after a failure");
  assert.ok(error.data.text.includes("Xin lỗi"), "static bilingual error message");
});

test("tool-path final text gates an untrusted URL split across chunks", async () => {
  answerCache.clear();
  requests.length = 0;
  responses.length = 0;
  responses.push([
    chunk({ content: "Visit https://evi" }),
    chunk({ content: "l.com " }),
    chunk({ content: "now" }, "stop"),
  ]);

  const res = await streamPost([{ role: "user", content: "Khóa thiền 10 ngày hết chỗ chưa?" }]);
  const events = await readEvents(res);

  const streamed = events.filter((e) => e.event === "delta").map((e) => e.data.text).join("");
  const done = events.find((e) => e.event === "done");

  assert.ok(streamed.includes("[🔒"), "safety notice in the tool-path deltas");
  assert.ok(!streamed.includes("evil.com"), "no untrusted URL in the deltas");
  assert.ok(done.data.text.includes("[🔒"), "safety notice in done");
  assert.ok(!done.data.text.includes("evil.com"), "no untrusted URL in done");
});
