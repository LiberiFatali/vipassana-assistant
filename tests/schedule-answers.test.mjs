/**
 * tests/schedule-answers.test.mjs — deterministic schedule answers in
 * lib/schedule-answers.js (no network; injected fixture data + fixed clock).
 *
 * Run: node --test tests/schedule-answers.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  detectScheduleIntent,
  formatScheduleAnswer,
  getScheduleAnswer,
} from "../lib/schedule-answers.js";

const NOW = new Date("2026-08-09T12:00:00");

const FIXTURE = [
  {
    center_id: "virocana",
    center: "Dhamma Virocana",
    type: "10-day",
    start_date: "2026-08-26",
    end_date: "2026-09-06",
    status: "open",
    apply_url: "https://schedule.vridhamma.org/vi/form/vi-application-form?course=1",
    data_freshness: "live",
  },
  {
    center_id: "virocana",
    center: "Dhamma Virocana",
    type: "Khoá 3 ngày",
    start_date: "2026-08-20",
    end_date: "2026-08-23",
    status: "open",
    apply_url: "https://schedule.vridhamma.org/vi/form/vi-application-form?course=2",
    data_freshness: "live",
  },
  {
    center_id: "virocana",
    center: "Dhamma Virocana",
    type: "10-day",
    start_date: "2026-07-01",
    end_date: "2026-07-12",
    status: "full",
    apply_url: null,
    data_freshness: "live",
  },
  {
    center_id: "virocana",
    center: "Dhamma Virocana",
    type: "satipatthana",
    start_date: "2026-10-14",
    end_date: "2026-10-22",
    status: "unknown",
    apply_url: null,
    data_freshness: "fallback",
  },
  {
    center_id: "vutthi",
    center: "Dhamma Vutthi",
    type: "10-day",
    start_date: "2026-08-26",
    end_date: "2026-09-06",
    status: "open",
    apply_url: "https://schedule.vridhamma.org/vi/form/vi-application-form?course=3",
    data_freshness: "live",
  },
];

const emptyList = async () => [];

// ─── Intent detection ─────────────────────────────────────────────────────────

test("end-of-month Hanoi question detects center + end_month window", () => {
  const q = detectScheduleIntent("Lịch thiền cuối tháng này ở Hà Nội", NOW);
  assert.ok(q, "should match");
  assert.equal(q.timeId, "end_month");
  assert.ok(q.centers.has("virocana"));
  assert.equal(q.lang, "vi");
  assert.deepEqual(q.window, { from: "2026-08-15", to: "2026-08-31" });
});

test("registration reminder question detects end_month + remind", () => {
  const q = detectScheduleIntent(
    "Tôi đã đăng ký khóa thiền cuối tháng này. Nhắc lại giúp tôi ngày tham gia",
    NOW
  );
  assert.ok(q, "should match");
  assert.equal(q.timeId, "end_month");
  assert.equal(q.remind, true);
  assert.equal(q.centers.size, 0, "no single center named");
});

test("next month in English", () => {
  const q = detectScheduleIntent("What courses are available next month?", NOW);
  assert.ok(q, "should match");
  assert.equal(q.timeId, "next_month");
  assert.equal(q.lang, "en");
});

test("specific month 'tháng 8' resolves to August 2026", () => {
  const q = detectScheduleIntent("Lịch khóa thiền tháng 8 ở Hà Nội", NOW);
  assert.ok(q, "should match");
  assert.equal(q.timeId, "month_8");
  assert.deepEqual(q.window, { from: "2026-08-01", to: "2026-08-31" });
});

test("knowledge questions never trigger", () => {
  for (const text of [
    "Vipassana là gì?",
    "Làm sao đăng ký khóa thiền?",
    "What is Vipassana?",
    "Khóa thiền 10 ngày hết chỗ chưa?",
    "Địa chỉ trung tâm Hà Nội?",
    "How to register?",
  ]) {
    assert.equal(detectScheduleIntent(text, NOW), null, `should not match: ${text}`);
  }
});

test("bare schedule query with course noun detects default upcoming window", () => {
  for (const text of [
    "khóa thiền sắp tới",
    "khi nào có khóa thiền",
    "xem lịch khóa thiền",
    "upcoming courses",
    "which courses are available",
    "cho tôi xem lịch thiền",
  ]) {
    const q = detectScheduleIntent(text, NOW);
    assert.ok(q, `should match: ${text}`);
    assert.equal(q.timeId, null, `no time cue expected: ${text}`);
    assert.equal(q.window, null, `window null → upcoming filter: ${text}`);
  }
});

test("registration-intent words with no course noun never get a default window", () => {
  for (const text of [
    "Làm sao đăng ký?",
    "how to register",
    "đăng ký như thế nào",
  ]) {
    assert.equal(detectScheduleIntent(text, NOW), null, `should not match: ${text}`);
  }
});

// ─── Formatting ───────────────────────────────────────────────────────────────

test("formatScheduleAnswer lists windowed courses with dates and apply links", () => {
  const q = detectScheduleIntent("Lịch thiền cuối tháng này ở Hà Nội", NOW);
  const out = formatScheduleAnswer(q, FIXTURE);

  assert.ok(out.includes("Dhamma Virocana"), "center heading present");
  assert.ok(out.includes("20/08/2026"), "start date formatted dd/mm/yyyy");
  assert.ok(out.includes("23/08/2026"), "end date formatted");
  assert.ok(out.includes("26/08/2026"), "second course present");
  assert.ok(!out.includes("2026-07-01") && !out.includes("01/07/2026"), "past course excluded");
  assert.ok(!out.includes("satipatthana"), "out-of-window course excluded");
  assert.ok(out.includes("Đăng ký"), "apply label present");
  assert.ok(out.includes("schedule.vridhamma.org"), "apply URL survives");
});

test("registration reminder answer includes the no-records caveat", () => {
  const q = detectScheduleIntent(
    "Tôi đã đăng ký khóa thiền cuối tháng này. Nhắc lại giúp tôi ngày tham gia",
    NOW
  );
  const out = formatScheduleAnswer(q, FIXTURE);
  assert.ok(out.includes("không lưu hồ sơ đăng ký cá nhân"), "caveat preface present");
  assert.ok(out.includes("Dhamma Vutthi"), "both centers listed when none named");
});

test("empty schedule produces a graceful empty state", () => {
  const q = detectScheduleIntent("Lịch thiền cuối tháng này ở Hà Nội", NOW);
  const out = formatScheduleAnswer(q, []);
  assert.ok(out.includes("chưa có khóa thiền nào"), "empty state message");
  assert.ok(out.includes("schedule.vridhamma.org/vi/courses/virocana"), "schedule link offered");
});

test("default upcoming answer labels the window and lists future courses", () => {
  const q = detectScheduleIntent("khóa thiền sắp tới", NOW);
  assert.ok(q, "default upcoming intent detected");
  const out = formatScheduleAnswer(q, FIXTURE);
  assert.ok(out.includes("khóa thiền sắp tới"), "upcoming label in Vietnamese prefix");
  assert.ok(out.includes("20/08/2026"), "upcoming course listed");
  assert.ok(out.includes("26/08/2026"), "later upcoming course listed");
  assert.ok(!out.includes("01/07/2026"), "past course excluded");
});

test("fallback data surfaces the warning", () => {
  const q = detectScheduleIntent("Lịch thiền cuối tháng này ở Hà Nội", NOW);
  const out = formatScheduleAnswer(q, FIXTURE);
  assert.ok(!out.includes("⚠️"), "no fallback in window, no warning");
});

test("fallback warning appears when a windowed course is fallback", () => {
  const q = detectScheduleIntent("Lịch thiền tháng 10 ở Hà Nội", NOW);
  const out = formatScheduleAnswer(q, FIXTURE);
  assert.ok(out.includes("⚠️"), "fallback warning surfaced");
  assert.ok(out.includes("Dữ liệu dự phòng"), "Vietnamese warning text");
});

// ─── getScheduleAnswer wiring ─────────────────────────────────────────────────

test("getScheduleAnswer returns formatted answer via injected list", async () => {
  const ans = await getScheduleAnswer("Lịch thiền cuối tháng này ở Hà Nội", "vi", {
    list: async ({ center }) => {
      assert.equal(center, "virocana");
      return FIXTURE;
    },
    now: NOW,
  });
  assert.ok(ans.includes("20/08/2026"));
});

test("getScheduleAnswer returns null for non-matching input", async () => {
  const ans = await getScheduleAnswer("Vipassana là gì?", "vi", {
    list: async () => FIXTURE,
    now: NOW,
  });
  assert.equal(ans, null);
});

test("getScheduleAnswer returns null when the list call throws", async () => {
  const ans = await getScheduleAnswer("Lịch thiền cuối tháng này ở Hà Nội", "vi", {
    list: async () => {
      throw new Error("network down");
    },
    now: NOW,
  });
  assert.equal(ans, null);
});
