/**
 * lib/schedule-answers.js — Deterministic schedule answers for live course data.
 *
 * Answers windowed schedule queries ("Lịch thiền cuối tháng này ở Hà Nội",
 * "Nhắc lại giúp tôi ngày tham gia") directly from scraped/cached course data
 * with NO LLM call — the live-data sibling of the quick-answers fast path.
 *
 * Matching is deliberately strict: a schedule/course keyword AND (a center cue
 * OR a time window) must both be present, so knowledge questions ("Vipassana là
 * gì?", "Làm sao đăng ký?") and ambiguous requests are never hijacked. Any
 * query that does not confidently match returns null and falls through to the
 * LLM tool loop.
 */
import { CENTERS } from "./centers.js";
import { detectLanguage, normalize } from "./router.js";
import { BOTH_CENTERS_CUES, CENTER_CUES } from "./quick-answers.js";
import { listCourses as listCoursesDefault } from "./tools/list-courses.js";

// ─── Trigger tables (all lowercase, diacritic-stripped) ──────────────────────

// A schedule/course keyword must be present for the deterministic path to fire.
const SCHEDULE_KEYWORDS = [
  // Vietnamese
  "lich", "schedule", "khoa thien", "khoa", "thien", "khi nao", "khi nào",
  "ngay khai giang", "ngày khai giảng", "ngay tham gia", "ngay tham du",
  "ngay bat dau", "ngay ket thuc", "con cho", "het cho", "da day", "kin cho",
  "dang ky", "đăng ký", "dang ki", "khai giang",
  "sap toi", "xem lich", "liet ke", "danh sach", "co khoa nao", "cac khoa",
  // English
  "course", "course date", "course dates", "start date", "start dates",
  "schedule", "upcoming", "when is", "when's", "register", "registration",
  "availability", "spots", "open course", "is the course full",
  "which courses", "list", "show",
];

// Course-noun cues — a bare schedule query (no center, no time window) only
// becomes a deterministic "upcoming" answer when a course noun is present.
const COURSE_NOUN_CUES = [
  "khoa", "course", "thien", "meditation", "lich", "schedule", "vipassana",
];

// Listing/query cues — combined with a course noun, they express "show me the
// courses" intent. Registration-only phrasing ("Làm sao đăng ký?") has neither
// and must fall through to the normal routing.
const LISTING_CUES = [
  "sap toi", "upcoming", "khi nao", "when is", "when's",
  "xem lich", "xem", "show", "see",
  "liet ke", "list", "danh sach", "co khoa", "which course",
  "lich",
];

// Time cues resolved in priority order against the normalized text. The window
// is a [from, to] ISO date range a course's start_date must fall in.
const TIME_CUE_ORDER = [
  ["end_month", /cuoi thang/],
  ["start_month", /dau thang/],
  ["this_month", /thang nay|this month/],
  ["next_month", /thang sau|next month/],
  ["this_week", /tuan nay|this week/],
  ["next_week", /tuan sau|next week/],
];

// "Nhắc lại ngày tham gia" style phrasing → add the no-personal-records caveat.
const REMIND_PHRASES = [
  "nhac lai", "ngay tham gia", "ngay tham du", "ngay bat dau", "remind",
  "remember",
];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function pad2(n) {
  return String(n).padStart(2, "0");
}

function isoDate(y, mo0, day) {
  return `${y}-${pad2(mo0 + 1)}-${pad2(day)}`;
}

function isoToday(now) {
  const d = new Date(now);
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

function lastDayOfMonth(y, mo0) {
  return new Date(y, mo0 + 1, 0).getDate();
}

function formatHumanDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const [y, m, d] = iso.split("-").map(Number);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Intent detection ─────────────────────────────────────────────────────────

function centerKeysFor(n) {
  const hits = new Set();
  for (const cue of CENTER_CUES) {
    if (cue.keywords.some((kw) => n.includes(kw))) {
      hits.add(cue.key);
    }
  }
  return hits;
}

function bothCenters(n) {
  return BOTH_CENTERS_CUES.some((kw) => n.includes(kw));
}

function timeIdFor(n) {
  for (const [id, re] of TIME_CUE_ORDER) {
    if (re.test(n)) {
      return id;
    }
  }
  const m = /thang\s+(\d{1,2})|month\s+(\d{1,2})/.exec(n);
  if (m) {
    return `month_${Number(m[1])}`;
  }
  return null;
}

/**
 * Compute the [from, to] ISO date range for a time cue, relative to `now`.
 */
function windowFor(timeId, n, now) {
  const d = new Date(now);
  const y = d.getFullYear();
  const mo0 = d.getMonth();
  const day = d.getDate();

  switch (timeId) {
    case "end_month": {
      const from = Math.max(15, day);
      return { from: isoDate(y, mo0, from), to: isoDate(y, mo0, lastDayOfMonth(y, mo0)) };
    }
    case "start_month":
      return { from: isoDate(y, mo0, 1), to: isoDate(y, mo0, 14) };
    case "this_month":
      return { from: isoDate(y, mo0, 1), to: isoDate(y, mo0, lastDayOfMonth(y, mo0)) };
    case "next_month": {
      const ny = mo0 === 11 ? y + 1 : y;
      const nm = (mo0 + 1) % 12;
      return { from: isoDate(ny, nm, 1), to: isoDate(ny, nm, lastDayOfMonth(ny, nm)) };
    }
    case "this_week": {
      const sinceMonday = (d.getDay() + 6) % 7;
      const start = new Date(y, mo0, day - sinceMonday);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { from: isoDate(start.getFullYear(), start.getMonth(), start.getDate()), to: isoDate(end.getFullYear(), end.getMonth(), end.getDate()) };
    }
    case "next_week": {
      const sinceMonday = (d.getDay() + 6) % 7;
      const start = new Date(y, mo0, day - sinceMonday + 7);
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return { from: isoDate(start.getFullYear(), start.getMonth(), start.getDate()), to: isoDate(end.getFullYear(), end.getMonth(), end.getDate()) };
    }
    default: {
      if (timeId.startsWith("month_")) {
        const mNum = Number(timeId.slice("month_".length));
        let year = y;
        if (mNum < mo0 + 1) {
          year += 1; // already passed this year → next occurrence
        }
        return { from: isoDate(year, mNum - 1, 1), to: isoDate(year, mNum - 1, lastDayOfMonth(year, mNum - 1)) };
      }
      return null;
    }
  }
}

/**
 * Pure intent detection for windowed schedule queries.
 *
 * @param {string} text  the user's latest message
 * @param {Date}   now   reference clock (defaults to real time; injectable for tests)
 * @returns {object|null} { lang, centers, both, window, timeId, remind, now }
 */
export function detectScheduleIntent(text, now = new Date()) {
  const lang = detectLanguage(text);
  const n = normalize(text);

  if (!SCHEDULE_KEYWORDS.some((kw) => n.includes(kw))) {
    return null;
  }

  const centers = centerKeysFor(n);
  const both = bothCenters(n);
  const timeId = timeIdFor(n);

  // Bare schedule query (no center, no time window): only accept it as a
  // deterministic "upcoming" answer when a course noun AND a listing cue are
  // both present ("khóa thiền sắp tới", "which courses", "xem lịch").
  // Registration-intent phrasing ("Làm sao đăng ký?", "how to register") has a
  // schedule keyword but no course noun, so it falls through to the tool loop.
  if (centers.size === 0 && !both && timeId === null) {
    const hasCourseNoun = COURSE_NOUN_CUES.some((c) => n.includes(c));
    const hasListingCue = LISTING_CUES.some((c) => n.includes(c));
    if (!hasCourseNoun || !hasListingCue) {
      return null;
    }
  }

  const window = timeId ? windowFor(timeId, n, now) : null;

  return {
    lang,
    centers,
    both,
    timeId,
    window,
    remind: REMIND_PHRASES.some((p) => n.includes(p)),
    now,
    n,
  };
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function selectedCenterKeys(query) {
  const { centers, both } = query;
  if (both || centers.size === 0 || centers.size === 2) {
    return ["virocana", "vutthi"];
  }
  return [...centers];
}

function statusText(status, lang) {
  const map = {
    open: lang === "vi" ? "đang nhận đăng ký" : "open for registration",
    full: lang === "vi" ? "đã hết chỗ" : "full",
    waitlist: lang === "vi" ? "danh sách chờ" : "waitlist",
    unknown: lang === "vi" ? "trạng thái chưa rõ" : "status unknown",
  };
  return map[status] || status;
}

function typeLabel(type, lang) {
  if (lang !== "vi") {
    return type;
  }
  const map = {
    "10-day": "Khóa 10 ngày",
    short: "Khóa ngắn ngày",
    satipatthana: "Khóa Satipatthana",
    children: "Khóa thiếu nhi",
    teen: "Khóa thanh thiếu niên",
  };
  return map[type] || type;
}

function windowLabel(query) {
  const { timeId, lang } = query;
  if (lang === "vi") {
    switch (timeId) {
      case "end_month":
        return "cuối tháng";
      case "start_month":
        return "đầu tháng";
      case "this_month":
        return "tháng này";
      case "next_month":
        return "tháng sau";
      case "this_week":
        return "tuần này";
      case "next_week":
        return "tuần sau";
      default:
        if (timeId && timeId.startsWith("month_")) {
          return `tháng ${timeId.slice("month_".length)}`;
        }
        return "sắp tới";
    }
  }
  switch (timeId) {
    case "end_month":
      return "end of this month";
    case "start_month":
      return "start of this month";
    case "this_month":
      return "this month";
    case "next_month":
      return "next month";
    case "this_week":
      return "this week";
    case "next_week":
      return "next week";
    default:
      if (timeId && timeId.startsWith("month_")) {
        return `month ${timeId.slice("month_".length)}`;
      }
      return "upcoming";
  }
}

function centerHeading(centerId, lang) {
  const c = CENTERS[centerId];
  const city = lang === "vi" ? c.city_vi : c.city;
  return `**${c.name}** — ${city}`;
}

function scheduleUrl(centerId, lang) {
  return lang === "vi" ? CENTERS[centerId].schedule_url_vi : CENTERS[centerId].schedule_url_en;
}

function applyLink(course, lang) {
  if (!course.apply_url || !/^https?:/.test(course.apply_url)) {
    return null;
  }
  return `[${lang === "vi" ? "Đăng ký" : "Apply"}](${course.apply_url})`;
}

function fallbackWarning(query) {
  if (query.lang === "vi") {
    return "⚠️ Dữ liệu dự phòng — vui lòng kiểm tra schedule.vridhamma.org để biết tình trạng hiện tại.";
  }
  return "⚠️ Fallback data — please check schedule.vridhamma.org for the current status.";
}

/**
 * Pure markdown renderer for a deterministic schedule answer.
 *
 * @param {object} query    the result of detectScheduleIntent
 * @param {Array}  courses  course objects from listCourses (with start_date ISO)
 * @returns {string}        bilingual markdown answer
 */
export function formatScheduleAnswer(query, courses) {
  const selected = selectedCenterKeys(query);
  const todayIso = isoToday(query.now);

  const inWindow = (c) => {
    if (!c.start_date || !ISO_DATE_RE.test(c.start_date)) {
      return false;
    }
    if (query.window) {
      return c.start_date >= query.window.from && c.start_date <= query.window.to;
    }
    return c.start_date >= todayIso;
  };

  const filtered = courses
    .filter((c) => selected.includes(c.center_id) && inWindow(c))
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));

  const byCenter = new Map();
  for (const course of filtered) {
    if (!byCenter.has(course.center_id)) {
      byCenter.set(course.center_id, []);
    }
    byCenter.get(course.center_id).push(course);
  }

  const prefix = query.remind
    ? query.lang === "vi"
      ? "Mình không lưu hồ sơ đăng ký cá nhân. Dưới đây là các khóa thiền để bạn đối chiếu ngày tham gia của mình:"
      : "I don't store personal registration records. Here are the courses so you can find your participation date:"
    : query.lang === "vi"
      ? `Đây là các khóa thiền ${windowLabel(query)}:`
      : `Here are the ${windowLabel(query)} courses:`;

  const lines = [prefix, ""];

  let listed = 0;
  const MAX_LISTED = 8;
  for (const centerId of selected) {
    const coursesOf = byCenter.get(centerId) || [];
    if (coursesOf.length === 0) {
      continue;
    }
    lines.push(centerHeading(centerId, query.lang));
    for (const course of coursesOf) {
      if (listed >= MAX_LISTED) {
        const more = filtered.length - listed;
        if (more > 0) {
          lines.push(
            query.lang === "vi"
              ? `- …và ${more} khóa nữa`
              : `- …and ${more} more`
          );
        }
        break;
      }
      const dates = course.end_date
        ? `${formatHumanDate(course.start_date)} → ${formatHumanDate(course.end_date)}`
        : formatHumanDate(course.start_date);
      let line = `- **${typeLabel(course.type, query.lang)}**: ${dates} — ${statusText(course.status, query.lang)}`;
      const apply = applyLink(course, query.lang);
      if (apply) {
        line += ` — ${apply}`;
      }
      lines.push(line);
      listed += 1;
    }
    lines.push("");
  }

  if (listed === 0) {
    lines.length = 0;
    lines.push(
      query.lang === "vi"
        ? `Hiện tại chưa có khóa thiền nào ${windowLabel(query)} tại các trung tâm nêu trên.`
        : `There are currently no ${windowLabel(query)} courses at the centers above.`
    );
    lines.push("");
  }

  lines.push(query.lang === "vi" ? "Xem lịch đầy đủ:" : "Full schedule:");
  for (const centerId of selected) {
    lines.push(`- ${scheduleUrl(centerId, query.lang)}`);
  }

  const hasFallback = filtered.some((c) => c.data_freshness === "fallback");
  if (hasFallback) {
    lines.push("");
    lines.push(fallbackWarning(query));
  }

  return lines.join("\n").trim();
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Return a deterministic schedule answer for a windowed schedule query, or null
 * to fall through to the LLM tool loop. Any failure returns null.
 *
 * @param {string} text  the user's latest message
 * @param {'vi'|'en'} [lang] detected language override (detected if omitted)
 * @param {object} [opts] injectable { list, now } for tests
 */
export async function getScheduleAnswer(text, lang, { list = listCoursesDefault, now = new Date() } = {}) {
  try {
    const detected = detectScheduleIntent(text, now);
    if (!detected) {
      return null;
    }
    if (lang) {
      detected.lang = lang === "vi" ? "vi" : "en";
    }

    const { centers, both } = detected;
    const center = both || centers.size !== 1 ? "all" : [...centers][0];

    const courses = await list({ center, language: detected.lang });

    const answer = formatScheduleAnswer(detected, courses);
    return answer || null;
  } catch {
    return null;
  }
}

/**
 * Pre-fetch live course schedule data and format a concise context block
 * for single-pass LLM prompt context (Pure Composer mode).
 */
export async function buildLiveScheduleContext(text, lang = "vi", { list = listCoursesDefault } = {}) {
  try {
    const courses = await list({ center: "all", language: lang });
    if (!Array.isArray(courses) || courses.length === 0) {
      return "Live Course Schedule Context: No courses currently available.";
    }
    const formatted = courses
      .slice(0, 10)
      .map(
        (c) =>
          `- Center: ${c.center} (${c.center_id}) | Type: ${c.type} | Dates: ${formatHumanDate(c.start_date)} - ${formatHumanDate(c.end_date)} | Status: ${c.status} | Apply: ${c.apply_url || "N/A"}`
      )
      .join("\n");
    return `Live Course Schedule Context (use this data to compose your response):\n${formatted}`;
  } catch {
    return "Live Course Schedule Context: Scraper currently unavailable.";
  }
}
