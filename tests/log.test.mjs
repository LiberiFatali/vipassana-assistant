/**
 * tests/log.test.mjs — unit tests for lib/log.js structured logging.
 *
 * Run: node --test tests/log.test.mjs
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  hashQuestion,
  logError,
  logInfo,
  logWarn,
  qPreview,
  safeErr,
  withLogContext,
} from "../lib/log.js";

const capture = { log: [], warn: [], error: [] };
const ORIGINAL = { log: console.log, warn: console.warn, error: console.error };
const savedEnv = {};

beforeEach(() => {
  capture.log.length = 0;
  capture.warn.length = 0;
  capture.error.length = 0;
  console.log = (s) => capture.log.push(s);
  console.warn = (s) => capture.warn.push(s);
  console.error = (s) => capture.error.push(s);
});

afterEach(() => {
  console.log = ORIGINAL.log;
  console.warn = ORIGINAL.warn;
  console.error = ORIGINAL.error;
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function setEnv(key, value) {
  savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function lines() {
  return [...capture.log, ...capture.warn, ...capture.error].map((s) => JSON.parse(s));
}

test("log lines are single JSON objects with ts, level, event", () => {
  logInfo("request.start", { nMessages: 2 });
  assert.equal(capture.log.length, 1);
  const line = JSON.parse(capture.log[0]);
  assert.equal(typeof line.ts, "string");
  assert.ok(!Number.isNaN(Date.parse(line.ts)));
  assert.equal(line.level, "info");
  assert.equal(line.event, "request.start");
  assert.equal(line.nMessages, 2);
});

test("level maps to the matching console method", () => {
  logInfo("a", {});
  logWarn("b", {});
  logError("c", {});
  assert.equal(capture.log.length, 1);
  assert.equal(capture.warn.length, 1);
  assert.equal(capture.error.length, 1);
  assert.equal(JSON.parse(capture.log[0]).event, "a");
  assert.equal(JSON.parse(capture.warn[0]).event, "b");
  assert.equal(JSON.parse(capture.error[0]).event, "c");
});

test("withLogContext merges request-scoped fields into every line", async () => {
  await withLogContext({ requestId: "req-1", conversationId: "conv-1", lang: "vi" }, async () => {
    logInfo("path.answer", { path: "quick" });
    await Promise.resolve();
    logWarn("schedule.fetch-error", { centerId: "virocana" });
  });
  const all = lines();
  assert.equal(all.length, 2);
  for (const l of all) {
    assert.equal(l.requestId, "req-1");
    assert.equal(l.conversationId, "conv-1");
    assert.equal(l.lang, "vi");
  }
  assert.equal(all[0].path, "quick");
  assert.equal(all[1].centerId, "virocana");
});

test("context is isolated across concurrent runs", async () => {
  await Promise.all([
    withLogContext({ requestId: "r-a" }, async () => {
      await new Promise((r) => setTimeout(r, 10));
      logInfo("done", {});
    }),
    withLogContext({ requestId: "r-b" }, async () => {
      logInfo("done", {});
    }),
  ]);
  const all = lines();
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((l) => l.requestId).sort(), ["r-a", "r-b"]);
});

test("safeErr reduces errors to bounded name + message", () => {
  const err = new Error("x".repeat(500));
  const out = safeErr(err);
  assert.equal(out.name, "Error");
  assert.equal(out.message.length, 300);
  assert.equal(safeErr(null), null);
  assert.equal(safeErr(undefined), null);
  assert.equal(safeErr({ name: "E", message: "m" }).message, "m");
});

test("hashQuestion is deterministic and bounded", () => {
  const a = hashQuestion("Thời khóa biểu?");
  const b = hashQuestion("thời khóa biểu?");
  const c = hashQuestion("completely different");
  assert.equal(a, b);
  assert.equal(a.length, 16);
  assert.match(a, /^[0-9a-f]{16}$/);
  assert.notEqual(a, c);
});

test("qPreview strips diacritics and truncates to 80 chars", () => {
  assert.equal(qPreview("Thời khóa biểu hôm nay"), "Thoi khoa bieu hom nay");
  assert.equal(qPreview("x".repeat(200)).length, 80);
  assert.equal(qPreview(undefined), "");
});

test("LOG_LEVEL=warn suppresses info events", () => {
  setEnv("LOG_LEVEL", "warn");
  logInfo("info-event", {});
  logWarn("warn-event", {});
  logError("error-event", {});
  assert.equal(capture.log.length, 0);
  assert.equal(capture.warn.length, 1);
  assert.equal(capture.error.length, 1);
});
