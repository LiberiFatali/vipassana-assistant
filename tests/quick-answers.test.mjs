/**
 * tests/quick-answers.test.mjs — deterministic structured answers in
 * api/quick-answers.js (no LLM calls).
 *
 * Run: node --test tests/quick-answers.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { getQuickAnswer } from "../api/quick-answers.js";
import { sanitize_urls } from "../api/sanitize.js";

test("virocana address in Vietnamese", () => {
  const out = getQuickAnswer("Địa chỉ trung tâm Hà Nội?", "vi");
  assert.ok(out.includes("Dhamma Virocana"));
  assert.ok(out.includes("Số 15-17 ngõ Sala"));
  assert.ok(out.includes("https://schedule.vridhamma.org/vi/courses/virocana"));
});

test("vutthi address in English", () => {
  const out = getQuickAnswer("What is the address of Dhamma Vutthi?", "en");
  assert.ok(out.includes("Dhamma Vutthi"));
  assert.ok(out.includes("112, đường 628"));
  assert.ok(out.includes("https://schedule.vridhamma.org/courses/vutthi"));
});

test("vutthi phone in Vietnamese", () => {
  const out = getQuickAnswer("Điện thoại trung tâm thiền TP Hồ Chí Minh?", "vi");
  assert.ok(out.includes("+84 942 255 050"));
});

test("virocana email in Vietnamese", () => {
  const out = getQuickAnswer("Cho tôi xin email liên hệ Dhamma Virocana", "vi");
  assert.ok(out.includes("contact.virocana@vridhamma.org"));
});

test("website query returns center website", () => {
  const out = getQuickAnswer("website của trung tâm Vutthi", "vi");
  assert.ok(out.includes("https://vutthi.vridhamma.org/vi"));
});

test("both centers when no single center is named", () => {
  const out = getQuickAnswer("Địa chỉ các trung tâm thiền?", "vi");
  assert.ok(out.includes("Dhamma Virocana"));
  assert.ok(out.includes("Dhamma Vutthi"));
});

test("bilingual definition in Vietnamese", () => {
  const out = getQuickAnswer("Vipassana là gì?", "vi");
  assert.ok(out.includes("Thiền Minh Sát"));
});

test("bilingual definition in English", () => {
  const out = getQuickAnswer("What is Vipassana?", "en");
  assert.ok(out.includes("to see things as they really are"));
});

test("meaning of vipassana triggers the definition", () => {
  assert.ok(getQuickAnswer("meaning of vipassana", "en").includes("ancient Indian meditation"));
});

test("non-match returns null (falls through to LLM)", () => {
  assert.equal(getQuickAnswer("Thời khóa biểu hằng ngày như thế nào?", "vi"), null);
  assert.equal(getQuickAnswer("What are the benefits of meditation?", "en"), null);
  assert.equal(getQuickAnswer("khóa thiền sắp tới ở Hà Nội?", "vi"), null);
});

test("quick-answer URLs survive sanitize_urls (trusted domains only)", () => {
  const out = getQuickAnswer("Địa chỉ trung tâm Hà Nội?", "vi");
  const sanitized = sanitize_urls(out);
  assert.ok(!sanitized.includes("[🔒"), "no untrusted link replacement");
  assert.ok(sanitized.includes("https://schedule.vridhamma.org/vi/courses/virocana"));
});

test("address answers never include the untrusted maps_url", () => {
  const out = getQuickAnswer("Địa chỉ trung tâm Hà Nội?", "vi");
  assert.ok(!out.includes("maps.app.goo.gl"));
});
