/**
 * tests/out-of-scope.test.mjs — unit tests for the deterministic out-of-scope
 * fallback (lib/out-of-scope.js).
 *
 * Covers the bilingual, diacritic-insensitive pattern matching and the static
 * bilingual fallback answer. The gate wiring into api/chat.js is exercised in
 * tests/chat-path.test.mjs (JSON) and tests/stream.test.mjs (SSE).
 *
 * Run: node --test tests/out-of-scope.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { detectOutOfScope, getOutOfScopeAnswer } from "../lib/out-of-scope.js";

// ─── Out-of-scope patterns fire ──────────────────────────────────────────────

test("oos: Vietnamese meditation-group question fires", () => {
  assert.equal(detectOutOfScope("Cho tôi hỏi nhóm thiền ở Hà Nội?"), true);
});

test("oos: English meditation-group question fires", () => {
  assert.equal(detectOutOfScope("Is there a meditation group in Hanoi?"), true);
});

test("oos: club phrase fires", () => {
  assert.equal(detectOutOfScope("câu lạc bộ thiền"), true);
});

test("oos: group meditation fires", () => {
  assert.equal(detectOutOfScope("group meditation"), true);
});

test("oos: meditation community and related variants fire", () => {
  assert.equal(detectOutOfScope("cộng đồng thiền"), true);
  assert.equal(detectOutOfScope("thiền nhóm"), true);
  assert.equal(detectOutOfScope("nhóm thiền định"), true);
  assert.equal(detectOutOfScope("group vipassana"), true);
});

test("oos: diacritic-free Vietnamese still fires", () => {
  assert.equal(detectOutOfScope("nhom thien o ha noi"), true);
});

// ─── In-scope questions must NOT fire ────────────────────────────────────────

test("oos: Vipassana definition question does not fire", () => {
  assert.equal(detectOutOfScope("What is Vipassana?"), false);
});

test("oos: center address question does not fire", () => {
  assert.equal(detectOutOfScope("Địa chỉ trung tâm thiền Hà Nội?"), false);
});

test("oos: course-schedule question does not fire", () => {
  assert.equal(detectOutOfScope("Lịch khóa thiền tháng sau?"), false);
});

test("oos: group-registration phrasing does not fire", () => {
  assert.equal(detectOutOfScope("đăng ký theo nhóm"), false);
});

test("oos: chitchat does not fire", () => {
  assert.equal(detectOutOfScope("Tell me about yourself"), false);
  assert.equal(detectOutOfScope("bạn khỏe không?"), false);
  assert.equal(detectOutOfScope("who are you"), false);
});

test("oos: 'hỏi thiền' (ask about meditation) does not fire", () => {
  // "hội thiền" is intentionally excluded because it would collide with this.
  assert.equal(detectOutOfScope("Cho tôi hỏi thiền là gì?"), false);
});

// ─── Fallback answer ─────────────────────────────────────────────────────────

test("oos: answer is language-aware and references the contact email", () => {
  const vi = getOutOfScopeAnswer("nhóm thiền", "vi");
  assert.ok(vi, "Vietnamese fallback returned");
  assert.ok(vi.includes("info@ucenlist.org"), "Vietnamese fallback mentions the email");
  assert.ok(vi.includes("ban quản trị"), "Vietnamese fallback mentions the admin team");

  const en = getOutOfScopeAnswer("meditation group", "en");
  assert.ok(en, "English fallback returned");
  assert.ok(en.includes("info@ucenlist.org"), "English fallback mentions the email");
  assert.ok(en.toLowerCase().includes("admin team"), "English fallback mentions the admin team");
});

test("oos: null when not out of scope", () => {
  assert.equal(getOutOfScopeAnswer("What is Vipassana?", "en"), null);
  assert.equal(getOutOfScopeAnswer("Địa chỉ trung tâm thiền Hà Nội?", "vi"), null);
});
