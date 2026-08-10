/**
 * Scraper for schedule.vridhamma.org — the VRI global course scheduling platform.
 * JS port of the original Python VRI schedule scraper (fetch + cheerio).
 *
 * Strategy:
 *   1. HTTP GET with a realistic browser User-Agent (avoids bot detection)
 *   2. Parse the Drupal Views table with cheerio
 *   3. If tbody has no rows, the content is JS-rendered — throw ScraperError
 *      so the caller falls back to cache or static fallback
 *
 * The VRI site uses Drupal 9 with Drupal Views. The JSON:API module is disabled
 * so scraping HTML is the only programmatic option.
 */
import * as cheerio from "cheerio";

export const VRI_SCHEDULE_URLS = {
  virocana: {
    vi: "https://schedule.vridhamma.org/vi/courses/virocana",
    en: "https://schedule.vridhamma.org/courses/virocana",
  },
  vutthi: {
    vi: "https://schedule.vridhamma.org/vi/courses/vutthi",
    en: "https://schedule.vridhamma.org/courses/vutthi",
  },
};

export const CENTER_NAMES = {
  virocana: "Dhamma Virocana",
  vutthi: "Dhamma Vutthi",
};

export const CENTER_LOCATIONS = {
  virocana: "Ha Noi",
  vutthi: "Ho Chi Minh City",
};

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
};

// Lowered from 15s in the Python port to ~8s (serverless function budget).
export const REQUEST_TIMEOUT = 8000;

// Strings that indicate a course is full (Vietnamese and English)
const FULL_INDICATORS = ["full", "hết chỗ", "đã đầy", "closed"];
const WAITLIST_INDICATORS = ["waitlist", "danh sách chờ", "chờ"];

// ─── Exceptions ───────────────────────────────────────────────────────────────

export class ScraperError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScraperError";
  }
}

export class EmptyScheduleError extends ScraperError {
  constructor(message) {
    super(message);
    this.name = "EmptyScheduleError";
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * GET a URL with the shared browser-like headers/timeout, mapping any
 * failure to ScraperError.
 */
export async function fetch_html(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  } catch (err) {
    if (err && err.name === "TimeoutError") {
      throw new ScraperError(`Request timed out fetching ${url}: ${err}`);
    }
    throw new ScraperError(`Network error fetching ${url}: ${err}`);
  }

  if (!response.ok) {
    throw new ScraperError(`HTTP ${response.status} fetching ${url}`);
  }

  try {
    return await response.text();
  } catch (err) {
    throw new ScraperError(`Network error fetching ${url}: ${err}`);
  }
}

/**
 * Fetch and parse the course listing from schedule.vridhamma.org.
 *
 * @param {'virocana'|'vutthi'} center_id
 * @param {'vi'|'en'} language
 * @returns {Promise<Array<object>>} List of course dicts (empty if none listed).
 * @throws {ScraperError} If the site is unreachable or returns an error status.
 * @throws {EmptyScheduleError} If the page loads but rows are JS-rendered (empty tbody).
 */
export async function fetch_courses(center_id, language = "vi") {
  const url = VRI_SCHEDULE_URLS[center_id][language];
  const html = await fetch_html(url);
  return parse_course_table(html, center_id);
}

// ─── HTML Parsing ─────────────────────────────────────────────────────────────

function hasAnyIndicator(lowerText, indicators) {
  return indicators.some((ind) => lowerText.includes(ind));
}

/**
 * Extract text like BeautifulSoup's get_text(separator=" ", strip=True):
 * inserts a space between adjacent text/tag children.
 */
function getText($, el) {
  const parts = [];
  $(el)
    .contents()
    .each((_i, node) => {
      if (node.type === "text" || node.type === "tag") {
        const t = $(node).text().trim();
        if (t) {
          parts.push(t);
        }
      }
    });
  return parts.join(" ");
}

/**
 * Parse the Drupal Views course table from the VRI schedule page.
 *
 * The target table has class 'tablesaw tablesaw-stack cols-5'.
 * Each <tr> in the tbody represents one course.
 *
 * @throws {EmptyScheduleError} If the table exists but tbody has no data rows,
 *   indicating JS-rendered content that wasn't executed.
 */
export function parse_course_table(html, center_id) {
  const $ = cheerio.load(html);

  // Find the course listing table
  let table = null;
  $("table").each((_i, el) => {
    const cls = $(el).attr("class") || "";
    if (cls.includes("tablesaw") && cls.includes("cols-5")) {
      table = $(el);
      return false; // break
    }
  });

  if (table === null) {
    // No table found at all — check if there's a "No course" message
    if ($(".course-list-empty").length > 0) {
      return []; // Legitimate empty schedule
    }
    throw new EmptyScheduleError(
      "Could not find the course table — page may require JavaScript to render."
    );
  }

  const tbody = table.find("tbody");
  if (tbody.length === 0) {
    throw new EmptyScheduleError("Course table has no tbody — JS-rendered content not available.");
  }

  const rows = tbody.find("tr");
  if (rows.length === 0) {
    throw new EmptyScheduleError("Course table tbody is empty — JS-rendered content not available.");
  }

  const courses = [];
  rows.each((_i, row) => {
    const course = _parse_row($, $(row), center_id);
    if (course) {
      courses.push(course);
    }
  });

  return courses;
}

/**
 * Parse a single table row into a course dict.
 */
function _parse_row($, row, center_id) {
  const cells = row.find("td");
  if (cells.length === 0) {
    return null;
  }

  // Column order (from the table header):
  // [0] Apply link  [1] Dates  [2] Type  [3] Old Students?  [4] Notes/Comments

  let apply_url = null;
  let status = "unknown";
  if (cells.length > 0) {
    [apply_url, status] = _parse_apply_cell($, cells.eq(0));
  }
  let start_date = "";
  let end_date = "";
  if (cells.length > 1) {
    [start_date, end_date] = _parse_date_cell($, cells.eq(1));
  }
  const course_type = cells.length > 2 ? _parse_type_cell($, cells.eq(2)) : "unknown";
  const notes = cells.length > 3 ? _parse_notes_cell($, cells.eq(cells.length - 1)) : "";

  return {
    center: CENTER_NAMES[center_id] || center_id,
    center_id,
    location: CENTER_LOCATIONS[center_id] || "",
    type: course_type,
    start_date,
    end_date,
    status,
    apply_url: apply_url || `https://schedule.vridhamma.org/vi/courses/${center_id}`,
    notes,
    data_freshness: "live",
  };
}

/**
 * Parse the Apply column. Returns [apply_url, status].
 * Status is 'open', 'full', 'waitlist', or 'unknown'.
 */
function _parse_apply_cell($, cell) {
  const link = cell.find("a");
  const text = cell.text().trim().toLowerCase();

  if (link.length > 0 && link.attr("href")) {
    let href = link.attr("href");
    if (!href.startsWith("http")) {
      href = "https://schedule.vridhamma.org" + href;
    }

    const linkText = link.text().trim().toLowerCase();
    return [href, parse_status(linkText)];
  }

  // No link — check text for clues
  if (hasAnyIndicator(text, FULL_INDICATORS)) {
    return [null, "full"];
  }
  if (hasAnyIndicator(text, WAITLIST_INDICATORS)) {
    return [null, "waitlist"];
  }

  return [null, "unknown"];
}

/**
 * Parse the Dates column. Returns [start_date_iso, end_date_iso] as
 * 'YYYY-MM-DD' strings, falling back to raw text on parse failure.
 */
function _parse_date_cell($, cell) {
  const raw = getText($, cell);
  return parse_dates(raw);
}

/**
 * Parse the course type column, normalising common values.
 */
function _parse_type_cell($, cell) {
  const raw = cell.text().trim();
  const lower = raw.toLowerCase();

  if (lower.includes("10") && (lower.includes("day") || lower.includes("ngày"))) {
    return "10-day";
  }
  if (lower.includes("short") || lower.includes("ngắn")) {
    return "short";
  }
  if (lower.includes("satipatthana")) {
    return "satipatthana";
  }
  if (lower.includes("children") || lower.includes("thiếu nhi")) {
    return "children";
  }
  if (lower.includes("teen") || lower.includes("thanh thiếu niên")) {
    return "teen";
  }

  return raw || "unknown";
}

/**
 * Parse the final Notes/Comments cell.
 */
function _parse_notes_cell($, cell) {
  return getText($, cell);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Infer registration status from link or cell text.
 * Returns: 'open' | 'full' | 'waitlist' | 'unknown'
 */
export function parse_status(text) {
  const lower = text.toLowerCase();
  if (hasAnyIndicator(lower, FULL_INDICATORS)) {
    return "full";
  }
  if (hasAnyIndicator(lower, WAITLIST_INDICATORS)) {
    return "waitlist";
  }
  if (["apply", "đăng ký", "apply now", "register"].includes(lower)) {
    return "open";
  }
  if (lower) {
    return "open"; // has a link → assume open unless text says otherwise
  }
  return "unknown";
}

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  thg: null, // "thg 1" Vietnamese style handled below
};

function monthNum(name) {
  const n = name.replace(".", "").toLowerCase();
  if (n in MONTHS && MONTHS[n] !== null) {
    return MONTHS[n];
  }
  // Vietnamese "thg 1".."thg 12"
  const m = /^thg?\s*(\d{1,2})$/i.exec(n.replace(/\./g, ""));
  if (m) {
    return Number(m[1]);
  }
  // French-style "janv.", "sept.", etc.
  const map = {
    janv: 1, janvier: 1, févr: 2, février: 2, mars: 3, avr: 4, avril: 4,
    mai: 5, juin: 6, juil: 7, juillet: 7, août: 8, sept: 9, septembre: 9,
    oct: 10, octobre: 10, nov: 11, novembre: 11, déc: 12, décembre: 12,
  };
  for (const [k, v] of Object.entries(map)) {
    if (n.startsWith(k)) {
      return v;
    }
  }
  return null;
}

/**
 * Parse a single date string into {y, mo, d} or null.
 * Missing years default to the current year (matching python-dateutil).
 */
function parseSingleDate(raw) {
  let s = raw.trim();

  // ISO YYYY-MM-DD
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) {
    return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
  }

  // "01 Aug 2026" / "01/08 2026" / "20 Th8 2026" style.
  // The month token may carry the attached-digit Vietnamese form ("Th8" =
  // tháng 8), so `[a-z]+` is widened to `[a-z]+\.?\d{0,2}`.
  m = /^(\d{1,2})\s+([a-z]+\.?\d{0,2})\.?\s+(\d{2,4})$/i.exec(s);
  if (m) {
    const mo = monthNum(m[2]);
    if (mo) {
      return { y: Number(m[3]), mo, d: Number(m[1]) };
    }
  }

  // "Aug 1, 2026" / "Th8 1, 2026" style
  m = /^([a-z]+\.?\d{0,2})\.?\s+(\d{1,2})\.?,?\s*(\d{2,4})$/i.exec(s);
  if (m) {
    const mo = monthNum(m[1]);
    if (mo) {
      return { y: Number(m[3]), mo, d: Number(m[2]) };
    }
  }

  // "01 Aug" / "Aug 1" / "20 Th8" / "Th8 1" style (no year)
  m = /^(\d{1,2})\s+([a-z]+\.?\d{0,2})\.?$/i.exec(s);
  if (m) {
    const mo = monthNum(m[2]);
    if (mo) {
      return { y: new Date().getFullYear(), mo, d: Number(m[1]) };
    }
  }
  m = /^([a-z]+\.?\d{0,2})\.?\s+(\d{1,2})\.?$/i.exec(s);
  if (m) {
    const mo = monthNum(m[1]);
    if (mo) {
      return { y: new Date().getFullYear(), mo, d: Number(m[2]) };
    }
  }

  // Numeric dayfirst: DD/MM[/YYYY], DD.MM.YYYY, DD-MM-YYYY, or "DD/MM YYYY"
  m = /^(\d{1,2})[/\-.](\d{1,2})(?:(?:\s*[/\-.]\s*|\s+)(\d{2,4}))?$/.exec(s);
  if (m) {
    return {
      y: m[3] ? Number(m[3]) : new Date().getFullYear(),
      mo: Number(m[2]),
      d: Number(m[1]),
    };
  }

  return null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDate(date) {
  if (!date || date.y == null || date.mo == null || date.d == null) {
    return null;
  }
  let year = date.y;
  if (year < 100) {
    year += 2000;
  }
  return `${year}-${pad2(date.mo)}-${pad2(date.d)}`;
}

/**
 * Parse a date range string from the VRI schedule table into ISO date strings.
 *
 * Handles formats like:
 *   - "01 Aug - 12 Aug 2026"
 *   - "01/08 - 12/08/2026"
 *   - "Aug 1 – Aug 12, 2026"
 *   - "2026-08-01 to 2026-08-12"
 *
 * Returns [start_date_iso, end_date_iso] as 'YYYY-MM-DD' strings,
 * or [raw_text, ""] on failure.
 */
export function parse_dates(text) {
  // Normalise separators (en/em dash → hyphen)
  text = text.trim().replace(/[–—]/g, "-");

  function parseRange(startRaw, endRaw) {
    try {
      // If year missing from start, borrow from end
      if (!/\d{4}/.test(startRaw) && /\d{4}/.test(endRaw)) {
        const ym = /\d{4}/.exec(endRaw);
        if (ym) {
          startRaw = `${startRaw} ${ym[0]}`;
        }
      }
      const startHasYear = /\d{4}/.test(startRaw);
      const endHasYear = /\d{4}/.test(endRaw);
      const start = parseSingleDate(startRaw);
      const end = parseSingleDate(endRaw);
      const fs = formatDate(start);
      let fe = formatDate(end);
      if (fs && fe) {
        // Cross-year range where both dates defaulted to the current year
        // (e.g. "29 Th12 - 2 Th1"): advance the end year by one.
        if (fe < fs && !startHasYear && !endHasYear && end && end.y != null) {
          end.y += 1;
          fe = formatDate(end);
        }
        if (fe) {
          return [fs, fe];
        }
      }
    } catch {
      // fall through to next separator
    }
    return null;
  }

  // Try splitting on common range separators (maxsplit=1, like the Python port)
  for (const sep of [" to ", " - ", "→", "->"]) {
    const idx = text.indexOf(sep);
    if (idx > -1) {
      const r = parseRange(text.slice(0, idx).trim(), text.slice(idx + sep.length).trim());
      if (r) {
        return r;
      }
    }
  }

  // Bare hyphen split (last resort for "01 Aug-12 Aug 2026" style)
  const idx = text.indexOf("-");
  if (idx > -1) {
    const r = parseRange(text.slice(0, idx).trim(), text.slice(idx + 1).trim());
    if (r) {
      return r;
    }
  }

  // Single date fallback
  const single = parseSingleDate(text);
  if (single) {
    const f = formatDate(single);
    if (f) {
      return [f, ""];
    }
  }

  return [text, ""]; // raw text as last resort
}
