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
  {
    center_id: "pala",
    center: "Dhamma Pala",
    type: "special",
    title: "Khoá thiền tại Dhamma Pala 2026",
    start_date: "",
    end_date: "",
    status: "open",
    data_freshness: "live",
  },
];

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
    "Lịch khóa thiền Vipassana",
    "Lịch khóa thiền",
    "Lịch thiền Vipassana",
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

test("dateless pala announcement appears in the default upcoming list", () => {
  const q = detectScheduleIntent("khóa thiền sắp tới", NOW);
  const out = formatScheduleAnswer(q, FIXTURE);
  assert.ok(out.includes("Dhamma Pala"), "pala center heading present");
  assert.ok(out.includes("Khoá thiền tại Dhamma Pala 2026"), "announcement title rendered");
  assert.ok(out.includes("ucenlist.org/course-schedule"), "only the official schedule link is shown");
  assert.ok(!out.includes("khaosat.me"), "no khaosat.me link anywhere");
  assert.ok(!out.includes("—  —"), "no empty date range rendered");
});

test("pala announcement renders even when the dated-course cap is reached", () => {
  const q = detectScheduleIntent("khóa thiền sắp tới", NOW);
  const many = [];
  for (let i = 0; i < 12; i += 1) {
    many.push({
      center_id: "virocana",
      center: "Dhamma Virocana",
      type: "10-day",
      start_date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      end_date: "",
      status: "open",
      apply_url: "https://schedule.vridhamma.org/vi/form/vi-application-form?course=x",
      data_freshness: "live",
    });
  }
  many.push({
    center_id: "pala",
    center: "Dhamma Pala",
    type: "special",
    title: "Khoá thiền tại Dhamma Pala 2026",
    start_date: "",
    end_date: "",
    status: "open",
    data_freshness: "live",
  });
  const out = formatScheduleAnswer(q, many);
  assert.ok(out.includes("…và "), "cap reached for dated courses");
  assert.ok(out.includes("Khoá thiền tại Dhamma Pala 2026"), "announcement still listed past the cap");
  assert.ok(out.includes("ucenlist.org/course-schedule"), "official schedule link present");
  assert.ok(!out.includes("khaosat.me"), "no khaosat.me link anywhere");
});

test("dateless pala announcement is excluded from dated window queries", () => {
  const q = detectScheduleIntent("Lịch thiền cuối tháng này ở Hà Nội", NOW);
  const out = formatScheduleAnswer(q, FIXTURE);
  assert.ok(!out.includes("Dhamma Pala"), "no pala entry in a dated window");
  assert.ok(!out.includes("ucenlist.org"), "no ucenlist schedule link in a Hanoi-only dated window");
});

test("targeted pala query detects the pala center and renders the announcement", () => {
  const q = detectScheduleIntent("khóa thiền tại Dhamma Pala sắp tới", NOW);
  assert.ok(q, "should match");
  assert.ok(q.centers.has("pala"), "pala center detected");
  const out = formatScheduleAnswer(q, FIXTURE);
  assert.ok(out.includes("Khoá thiền tại Dhamma Pala 2026"), "announcement listed for targeted query");
  assert.ok(out.includes("ucenlist.org/course-schedule"), "official schedule link present");
  assert.ok(!out.includes("khaosat.me"), "no khaosat.me link anywhere");
});

test("unknown-id announcement renders in the default upcoming list", () => {
  const q = detectScheduleIntent("khóa thiền sắp tới", NOW);
  const out = formatScheduleAnswer(
    q,
    FIXTURE.concat([
      {
        center_id: "special",
        center: "Dhamma Pala",
        type: "special",
        title: "Khoá thiền đặc biệt 2027",
        start_date: "",
        end_date: "",
        status: "open",
        data_freshness: "live",
      },
    ])
  );
  assert.ok(out.includes("Khoá thiền đặc biệt 2027"), "unknown-id announcement rendered");
  assert.ok(out.includes("Dhamma Pala"), "graceful heading fallback to course.center");
  assert.ok(!out.includes("khaosat.me"), "no untrusted link anywhere");
});

test("unknown-id announcement is excluded from dated window queries", () => {
  const q = detectScheduleIntent("Lịch thiền cuối tháng này ở Hà Nội", NOW);
  const out = formatScheduleAnswer(
    q,
    FIXTURE.concat([
      {
        center_id: "special",
        center: "Dhamma Pala",
        type: "special",
        title: "Khoá thiền đặc biệt 2027",
        start_date: "",
        end_date: "",
        status: "open",
        data_freshness: "live",
      },
    ])
  );
  assert.ok(!out.includes("Khoá thiền đặc biệt 2027"), "no announcement in a dated window");
});

test("dateless non-special record is not surfaced in the upcoming list", () => {
  const q = detectScheduleIntent("khóa thiền sắp tới", NOW);
  const out = formatScheduleAnswer(
    q,
    FIXTURE.concat([
      {
        center_id: "virocana",
        center: "Dhamma Virocana",
        type: "10-day",
        start_date: "TBA",
        end_date: "",
        status: "unknown",
        data_freshness: "live",
      },
    ])
  );
  assert.ok(!out.includes("TBA"), "dateless non-special record is not treated as an announcement");
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
