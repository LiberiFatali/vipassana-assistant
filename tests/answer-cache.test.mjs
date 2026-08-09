/**
 * tests/answer-cache.test.mjs — in-memory TTL/size-capped answer cache in
 * api/answer-cache.js.
 *
 * Run: node --test tests/answer-cache.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { AnswerCache } from "../api/answer-cache.js";

test("set then get returns the answer", () => {
  const c = new AnswerCache();
  c.set("vi|dia chi", "some address");
  assert.equal(c.get("vi|dia chi"), "some address");
});

test("get on a missing key returns null", () => {
  const c = new AnswerCache();
  assert.equal(c.get("en|nope"), null);
});

test("expired entries return null and are evicted", () => {
  const c = new AnswerCache({ ttlMs: -1 });
  c.set("k", "v");
  assert.equal(c.get("k"), null);
  assert.equal(c.size, 0);
});

test("size cap evicts the oldest entry", () => {
  const c = new AnswerCache({ maxEntries: 2 });
  c.set("a", "1");
  c.set("b", "2");
  c.set("c", "3");
  assert.equal(c.get("a"), null);
  assert.equal(c.get("b"), "2");
  assert.equal(c.get("c"), "3");
});

test("re-setting a key refreshes it instead of evicting", () => {
  const c = new AnswerCache({ maxEntries: 2 });
  c.set("a", "1");
  c.set("b", "2");
  c.set("a", "updated");
  c.set("c", "3");
  assert.equal(c.get("a"), "updated");
  assert.equal(c.get("b"), null);
  assert.equal(c.get("c"), "3");
});

test("clear removes one key or the whole cache", () => {
  const c = new AnswerCache();
  c.set("a", "1");
  c.set("b", "2");
  c.clear("a");
  assert.equal(c.get("a"), null);
  assert.equal(c.get("b"), "2");
  c.clear();
  assert.equal(c.size, 0);
});
