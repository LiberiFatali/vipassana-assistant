/**
 * tests/retrieval.test.mjs — unit tests for the bilingual BM25 retrieval
 * engine (lib/retrieval.js): tokenization, ranked retrieval, deterministic
 * kb-vs-tools classification, and retrieval-based section selection.
 *
 * Run: node --test tests/retrieval.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyByRetrieval,
  retrieve,
  selectSectionsByRetrieval,
  tokenize,
} from "../lib/retrieval.js";

// ─── Tokenization ───────────────────────────────────────────────────────────

test("tokenize: strips diacritics, lowercases, and drops 1-char tokens", () => {
  assert.deepEqual(tokenize("Thời Khóa Biểu Đức Phật"), ["thoi", "khoa", "bieu", "duc", "phat"]);
});

test("tokenize: keeps 2+ char tokens, drops 1-char and punctuation", () => {
  assert.deepEqual(tokenize("10 ngày / 4:00 a.m"), ["10", "ngay", "00"]);
});

test("tokenize: empty input yields no tokens", () => {
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize(null), []);
});

// ─── Retrieval ──────────────────────────────────────────────────────────────

test("retrieve: returns ranked { id, score, cls } sorted by score", () => {
  const results = retrieve("What is Vipassana?", 5);
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.equal(typeof r.id, "string");
    assert.equal(typeof r.score, "number");
    assert.ok(r.cls === "kb" || r.cls === "tools");
  }
  for (let i = 1; i < results.length; i += 1) {
    assert.ok(results[i - 1].score >= results[i].score, "scores are sorted descending");
  }
});

test("retrieve: tools exemplar corpus is searchable", () => {
  const results = retrieve("khóa thiền sắp tới", 10);
  assert.ok(results.some((r) => r.cls === "tools"), "a tools exemplar ranks among the results");
});

test("retrieve: unknown tokens produce no results", () => {
  assert.deepEqual(retrieve("zzzqwerty", 5), []);
});

// ─── Deterministic classification ───────────────────────────────────────────

test("classify: clear knowledge question is kb", () => {
  assert.equal(classifyByRetrieval("What is Vipassana?").kind, "kb");
  assert.equal(classifyByRetrieval("Nội quy giới luật của khóa thiền 10 ngày là gì?").kind, "kb");
});

test("classify: diacritic-free Vietnamese timetable question is kb", () => {
  assert.equal(classifyByRetrieval("thoi khoa bieu hang ngay").kind, "kb");
});

test("classify: clear live-data questions are tools without an LLM call", () => {
  assert.equal(classifyByRetrieval("Những khóa nào sắp diễn ra trong thời gian tới?").kind, "tools");
  assert.equal(classifyByRetrieval("Is the next course full?").kind, "tools");
  assert.equal(classifyByRetrieval("How do I register for a course?").kind, "tools");
  assert.equal(classifyByRetrieval("Lịch khóa thiền tháng sau có gì?").kind, "tools");
});

test("classify: low-confidence/ambiguous inputs stay ambiguous", () => {
  assert.equal(classifyByRetrieval("khóa thiền").kind, "ambiguous");
  assert.equal(classifyByRetrieval("course").kind, "ambiguous");
  assert.equal(classifyByRetrieval("satipatthana").kind, "ambiguous");
});

test("classify: no matching vocabulary reports ambiguous", () => {
  assert.equal(classifyByRetrieval("zzzqwerty").kind, "ambiguous");
});

test("classify: surfaces both class scores", () => {
  const r = classifyByRetrieval("What is Vipassana?");
  assert.ok(r.kbScore > 0);
  assert.equal(typeof r.toolsScore, "number");
});

// ─── Section selection ──────────────────────────────────────────────────────

test("select: English what-is-Vipassana selects section 2", () => {
  assert.ok(selectSectionsByRetrieval("What is Vipassana?").includes(2));
});

test("select: Vietnamese discipline question selects section 6", () => {
  assert.ok(selectSectionsByRetrieval("Nội quy giới luật của khóa thiền 10 ngày là gì?").includes(6));
});

test("select: daily timetable selects section 7, diacritic-free included", () => {
  assert.ok(selectSectionsByRetrieval("What is the daily timetable?").includes(7));
  assert.ok(selectSectionsByRetrieval("thoi khoa bieu hang ngay").includes(7));
});

test("select: unmatched query returns empty (caller falls back to defaults)", () => {
  assert.deepEqual(selectSectionsByRetrieval("zzzqwerty"), []);
});

test("select: results are deduplicated section numbers", () => {
  const ids = selectSectionsByRetrieval("What is Vipassana?", 5);
  assert.equal(new Set(ids).size, ids.length, "no duplicate section numbers");
  assert.ok(ids.every((n) => Number.isInteger(n) && n >= 1));
});
