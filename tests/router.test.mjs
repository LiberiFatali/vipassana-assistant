/**
 * tests/router.test.mjs — unit tests for the bilingual intent router.
 *
 * Covers local keyword classification (knowledge-only / live-data / ambiguous),
 * language detection, and text normalization. The LLM classifier fallback is
 * exercised indirectly in tests/chat-path.test.mjs.
 *
 * Run: node --test tests/router.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyLocal, detectLanguage, normalize } from "../api/router.js";

// ─── Knowledge-only routing ─────────────────────────────────────────────────

test("kb: English what-is-Vipassana question routes to fast path", () => {
  assert.equal(classifyLocal("What is Vipassana?").kind, "kb");
});

test("kb: English Goenka biography question routes to fast path", () => {
  assert.equal(classifyLocal("Who is S.N. Goenka?").kind, "kb");
});

test("kb: Vietnamese discipline-rules question routes to fast path", () => {
  assert.equal(classifyLocal("Nội quy giới luật của khóa thiền 10 ngày là gì?").kind, "kb");
});

test("kb: daily timetable question routes to fast path (not live schedule)", () => {
  assert.equal(classifyLocal("What is the daily timetable during the course?").kind, "kb");
  assert.equal(classifyLocal("Thời khóa biểu hằng ngày trong khóa như thế nào?").kind, "kb");
});

test("kb: center contact/address question routes to fast path", () => {
  assert.equal(classifyLocal("Địa chỉ trung tâm thiền Hà Nội ở đâu?").kind, "kb");
});

test("kb: history mention is not treated as a live-schedule 'lịch'", () => {
  assert.equal(classifyLocal("Lịch sử của truyền thống thiền là gì?").kind, "kb");
});

test("kb: unknown/off-topic question defaults to fast path", () => {
  assert.equal(classifyLocal("Tell me about yourself").kind, "kb");
});

// ─── Live-data (tool) routing ────────────────────────────────────────────────

test("tools: Vietnamese course-schedule question routes to tool path", () => {
  assert.equal(classifyLocal("Lịch khai giảng các khóa thiền sắp tới ở Hà Nội?").kind, "tools");
});

test("tools: bare 'lịch' course-schedule question routes to tool path", () => {
  assert.equal(classifyLocal("Lịch khóa thiền tháng sau có gì?").kind, "tools");
});

test("tools: English next-course/availability question routes to tool path", () => {
  assert.equal(classifyLocal("Is the next 10-day course full?").kind, "tools");
});

test("tools: registration question routes to tool path", () => {
  assert.equal(classifyLocal("Có còn chỗ đăng ký khóa thiền không?").kind, "tools");
  assert.equal(classifyLocal("How do I register for a course?").kind, "tools");
});

// ─── Ambiguous routing (LLM classifier decides) ──────────────────────────────

test("ambiguous: bare 'course'/'khóa thiền' is not decided locally", () => {
  assert.equal(classifyLocal("khóa thiền").kind, "ambiguous");
  assert.equal(classifyLocal("satipatthana").kind, "ambiguous");
  assert.equal(classifyLocal("Which course is suitable for me?").kind, "ambiguous");
});

// ─── Language detection ──────────────────────────────────────────────────────

test("language: Vietnamese text with diacritics is detected as vi", () => {
  assert.equal(detectLanguage("Thiền Vipassana là gì?"), "vi");
  assert.equal(detectLanguage("Nội quy giới luật"), "vi");
});

test("language: Vietnamese text without diacritics is detected as vi", () => {
  assert.equal(detectLanguage("khai giang khoa thien"), "vi");
});

test("language: English text is detected as en", () => {
  assert.equal(detectLanguage("What is Vipassana?"), "en");
  assert.equal(detectLanguage("course schedule"), "en");
});

// ─── Normalization ───────────────────────────────────────────────────────────

test("normalize: strips Vietnamese diacritics and lowercases", () => {
  assert.equal(normalize("Thời Khóa Biểu Đức Phật"), "thoi khoa bieu duc phat");
});

test("normalize: keeps ASCII untouched", () => {
  assert.equal(normalize("What is Vipassana?"), "what is vipassana?");
});
