/**
 * tests/vri-schedule.test.mjs — course date parsing in
 * lib/scraper/vri-schedule.js (no network).
 *
 * Run: node --test tests/vri-schedule.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { parse_dates } from "../lib/scraper/vri-schedule.js";

test("Vietnamese attached-digit month parses (20 Th8 - 23 Th8)", () => {
  assert.deepEqual(parse_dates("20 Th8 - 23 Th8"), ["2026-08-20", "2026-08-23"]);
});

test("Vietnamese month range crossing into next month", () => {
  assert.deepEqual(parse_dates("26 Th8 - 6 Th9"), ["2026-08-26", "2026-09-06"]);
});

test("Vietnamese three-digit month (Th10)", () => {
  assert.deepEqual(parse_dates("14 Th10 - 25 Th10"), ["2026-10-14", "2026-10-25"]);
});

test("Vietnamese month with explicit year", () => {
  assert.deepEqual(parse_dates("1 Th1 2026"), ["2026-01-01", ""]);
});

test("cross-year range borrows the year forward", () => {
  assert.deepEqual(parse_dates("29 Th12 - 2 Th1"), ["2026-12-29", "2027-01-02"]);
});

test("existing English day-month-year range still parses", () => {
  assert.deepEqual(parse_dates("01 Aug - 12 Aug 2026"), ["2026-08-01", "2026-08-12"]);
});

test("existing English month-day-year range still parses", () => {
  assert.deepEqual(parse_dates("Aug 1, 2026"), ["2026-08-01", ""]);
});

test("mixed Vietnamese month across July/August", () => {
  assert.deepEqual(parse_dates("29 Th7 - 9 Th8"), ["2026-07-29", "2026-08-09"]);
});

test("unparseable text falls back to raw string", () => {
  assert.deepEqual(parse_dates("TBA"), ["TBA", ""]);
});
