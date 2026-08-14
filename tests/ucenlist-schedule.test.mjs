/**
 * tests/ucenlist-schedule.test.mjs — special course announcement extraction
 * from the UCENLIST Odoo course-schedule page (no network).
 *
 * Run: node --test tests/ucenlist-schedule.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { parse_special_courses } from "../lib/scraper/ucenlist-schedule.js";

// Simplified Odoo page structure mirroring ucenlist.org/en/course-schedule:
// page-title section (no link), two center boxes (vridhamma links only), and
// the special announcement section with an external khaosat.me link.
const ODOO_PAGE = `
<!DOCTYPE html><html><body>
<main>
  <section class="s_title pt40"><div><h1>Course Schedule</h1></div></section>
  <section class="s_color_blocks_2">
    <div><h2>Ha Noi City</h2>
      <a href="https://schedule.vridhamma.org/vi/courses/virocana">UCENLIST HN</a></div>
    <div><h2>Ho Chi Minh City</h2>
      <a href="https://schedule.vridhamma.org/vi/courses/vutthi">UCENLIST HCM</a></div>
  </section>
  <section class="s_title o_cc o_cc2 pb56 pt24 pala-2026">
    <div><h1><span>Khoá thiền tại Dhamma Pala 2026</span></h1>
      <p><a href="https://khaosat.me/i/ucenlist-dhamma-pala-2026" target="_blank">Link đăng ký</a></p></div>
  </section>
</main>
</body></html>
`;

test("extracts the Dhamma Pala special announcement", () => {
  const courses = parse_special_courses(ODOO_PAGE);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].center_id, "pala");
  assert.equal(courses[0].title, "Khoá thiền tại Dhamma Pala 2026");
  assert.ok(!("apply_url" in courses[0]), "external (khaosat.me) href is not captured");
});

test("excludes the center boxes and the page-title section", () => {
  const courses = parse_special_courses(ODOO_PAGE);
  const titles = courses.map((c) => c.title);
  assert.ok(!titles.some((t) => /Ha Noi City|Ho Chi Minh City/.test(t)));
  assert.ok(!titles.some((t) => /Course Schedule/.test(t)));
});

test("returns an empty array when no special section exists", () => {
  const html = `
    <section class="s_title"><div><h1>Course Schedule</h1></div></section>
    <section class="s_color_blocks_2"><div><h2>Ha Noi City</h2>
      <a href="https://schedule.vridhamma.org/vi/courses/virocana">UCENLIST HN</a></div></section>
  `;
  assert.deepEqual(parse_special_courses(html), []);
});

test("returns an empty array for non-HTML garbage", () => {
  assert.deepEqual(parse_special_courses("{ not html }"), []);
});

test("center_id falls back to a heading-derived id without a class slug", () => {
  const html = `
    <section class="s_title"><div><h1>Khóa thiền tại Dhamma Pala 2027</h1>
      <p><a href="https://khaosat.me/i/ucenlist-pala-2027">Đăng ký</a></p></div></section>
  `;
  const courses = parse_special_courses(html);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].center_id, "pala");
  assert.equal(courses[0].title, "Khóa thiền tại Dhamma Pala 2027");
  assert.ok(!("apply_url" in courses[0]), "no apply_url captured");
});

test("center_id 'special' fallback is preserved for unparseable headings", () => {
  const html = `
    <section class="s_title"><div><h1>Khoá thiền 2026</h1>
      <p><a href="https://khaosat.me/i/ucenlist-special-2026">Đăng ký</a></p></div></section>
  `;
  const courses = parse_special_courses(html);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].center_id, "special", "no slug or 'Dhamma X' heading → 'special'");
});