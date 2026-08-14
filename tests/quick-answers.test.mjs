/**
 * tests/quick-answers.test.mjs — deterministic structured answers in
 * lib/quick-answers.js (no LLM calls).
 *
 * Run: node --test tests/quick-answers.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { getQuickAnswer } from "../lib/quick-answers.js";
import { sanitize_urls } from "../lib/sanitize.js";

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

test("vutthi directions query in Vietnamese — explicit chỉ đường", () => {
  const out = getQuickAnswer("chỉ đường cho tôi đến trung tâm ở HCM", "vi");
  assert.ok(out.includes("Dhamma Vutthi"));
  assert.ok(out.includes("Củ Chi"));
});

test("virocana directions — paraphrase without keyword (BM25 semantic match)", () => {
  // No explicit keyword — BM25 must detect 'address/navigation' intent from context
  const out = getQuickAnswer("Làm sao đi đến trung tâm thiền Hà Nội?", "vi");
  assert.ok(out !== null, "BM25 should detect navigation intent");
  assert.ok(out.includes("Dhamma Virocana"));
});

test("vutthi navigation via transport mode — BM25 generalizes to taxi/grab", () => {
  const out = getQuickAnswer("Đi grab đến Dhamma Vutthi như thế nào?", "vi");
  assert.ok(out !== null, "BM25 should score grab/taxi tokens against address exemplar");
  assert.ok(out.includes("Dhamma Vutthi"));
});

test("English directions paraphrase — how to get to", () => {
  const out = getQuickAnswer("How do I get to Dhamma Vutthi?", "en");
  assert.ok(out !== null, "BM25 should match 'how to get' navigation intent");
  assert.ok(out.includes("Dhamma Vutthi"));
});

test("general center info intent — broad query returns all fields", () => {
  const out = getQuickAnswer("Cho tôi biết về trung tâm ở HCM", "vi");
  assert.ok(out !== null, "general intent should fire for broad center info query");
  assert.ok(out.includes("Dhamma Vutthi"));
  // general intent includes address + phone + email + website
  assert.ok(out.includes("112, đường 628"));
  assert.ok(out.includes("+84 942 255 050"));
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

test("pala center info renders location and schedule link without empty fields", () => {
  const out = getQuickAnswer("Cho tôi biết về trung tâm Dhamma Pala", "vi");
  assert.ok(out.includes("Dhamma Pala"), "pala center heading present");
  assert.ok(out.includes("Bodh Gaya"), "location present");
  assert.ok(!out.includes("Địa chỉ:"), "empty address field skipped");
  assert.ok(!out.includes("Điện thoại:"), "empty phone field skipped");
  assert.ok(out.includes("https://ucenlist.org/course-schedule"), "schedule link present");
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

test("paraphrased definition questions trigger the curated definition", () => {
  assert.ok(getQuickAnswer("Kể cho tôi về Vipassana", "vi").includes("Thiền Minh Sát"));
  assert.ok(getQuickAnswer("Giới thiệu về Vipassana", "vi").includes("Thiền Minh Sát"));
  assert.ok(getQuickAnswer("Tell me about Vipassana", "en").includes("to see things as they really are"));
  assert.ok(getQuickAnswer("About Vipassana meditation", "en").includes("ancient Indian meditation"));
});

test("cost FAQ in Vietnamese and English", () => {
  assert.ok(getQuickAnswer("Khóa thiền có miễn phí không?", "vi").includes("miễn phí"));
  assert.ok(getQuickAnswer("How much does the course cost?", "en").includes("no charge"));
  assert.ok(getQuickAnswer("cúng dường là gì?", "vi").includes("cúng dường"));
  assert.ok(getQuickAnswer("Is the course free?", "en").includes("donation"));
});

test("diet FAQ in Vietnamese and English", () => {
  assert.ok(getQuickAnswer("Đồ ăn trong khóa có chay không?", "vi").includes("ăn chay"));
  assert.ok(getQuickAnswer("Is the food vegetarian?", "en").includes("vegetarian"));
  assert.ok(getQuickAnswer("Tôi có thể mang đồ ăn riêng không?", "vi").includes("mang thức ăn"));
});

test("eligibility FAQ in Vietnamese and English", () => {
  assert.ok(getQuickAnswer("Ai có thể tham gia khóa thiền?", "vi").includes("sức khỏe"));
  assert.ok(getQuickAnswer("Who can attend the course?", "en").includes("reasonable physical and mental health"));
  assert.ok(getQuickAnswer("Điều kiện tham gia là gì?", "vi").includes("sức khỏe"));
});

test("non-match returns null (falls through to LLM)", () => {
  assert.equal(getQuickAnswer("Thời khóa biểu hằng ngày như thế nào?", "vi"), null);
  assert.equal(getQuickAnswer("What are the benefits of meditation?", "en"), null);
  assert.equal(getQuickAnswer("khóa thiền sắp tới ở Hà Nội?", "vi"), null);
  assert.equal(getQuickAnswer("Làm sao đăng ký khóa thiền?", "vi"), null);
  assert.equal(getQuickAnswer("How do I register?", "en"), null);
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
