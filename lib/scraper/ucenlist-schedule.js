/**
 * Scraper for ucenlist.org/course-schedule — the UCENLIST Odoo page that
 * carries special/one-off course announcements beyond the two VRI centers
 * (e.g. "Khoá thiền tại Dhamma Pala 2026"). Such announcements have a course
 * heading but typically no dates.
 *
 * Strategy:
 *   1. HTTP GET the page (shared browser-like headers/timeout from
 *      lib/scraper/vri-schedule.js fetch_html)
 *   2. Iterate <section> elements and qualify a section as an announcement
 *      when it has a heading AND an external link whose host is not
 *      vridhamma.org/ucenlist.org AND course-like text
 *   3. Network failures throw ScraperError so the caller falls back to
 *      cache or static fallback; a page with no matching sections returns [].
 *
 * Only the announcement title (heading) is captured — external registration
 * links on the page (e.g. khaosat.me) are NOT returned, since only official
 * ucenlist.org / vridhamma.org links may reach the user. The external-link
 * presence is still used as a signal that a section is an announcement.
 */
import * as cheerio from "cheerio";
import { fetch_html } from "./vri-schedule.js";
import { stripDiacritics } from "../normalize.js";

export const UCENLIST_SCHEDULE_URLS = {
  vi: "https://ucenlist.org/course-schedule",
  en: "https://ucenlist.org/en/course-schedule",
};

// Course-announcement text signature — matched against diacritic-stripped
// text so "khóa thiền"/"khoá thiền"/"khoa thien" and English "course" all hit.
const COURSE_TEXT_RE = /khoa thien|course/i;

// Headings that identify a section as an announcement.
const HEADING_SELECTOR = "h1, h2, h3";

/**
 * Fetch and parse special course announcements from the UCENLIST
 * course-schedule page.
 *
 * @param {'vi'|'en'} language
 * @returns {Promise<Array<object>>} List of { center_id, title }
 * @throws {ScraperError} If the page is unreachable or returns an error status.
 */
export async function fetch_special_courses(language = "vi") {
  const url = UCENLIST_SCHEDULE_URLS[language];
  const html = await fetch_html(url);
  return parse_special_courses(html);
}

/**
 * Extract special course announcements from the Odoo course-schedule HTML.
 *
 * A section qualifies when it has a heading (h1/h2/h3), at least one external
 * link whose host is not vridhamma.org/ucenlist.org, and course-like text.
 * This excludes the page-title section (no link) and the two center boxes
 * (they only link to vridhamma.org). The external link is only used as a
 * signal — its href is not returned.
 *
 * @param {string} html
 * @returns {Array<object>} [{ center_id, title }]
 */
export function parse_special_courses(html) {
  const $ = cheerio.load(html);
  const courses = [];

  $("section").each((_i, el) => {
    const $section = $(el);
    const heading = $section.find(HEADING_SELECTOR).first().text().trim();
    if (!heading) {
      return;
    }

    const externalLink = $section.find('a[href^="http"]').toArray().find((a) => {
      try {
        const host = new URL($(a).attr("href")).hostname;
        return !/(^|\.)(vridhamma\.org|ucenlist\.org)$/.test(host);
      } catch {
        return false;
      }
    });
    if (!externalLink) {
      return;
    }

    const sectionText = $section.text();
    if (!COURSE_TEXT_RE.test(stripDiacritics(sectionText))) {
      return;
    }

    courses.push({
      center_id: deriveCenterId($section.attr("class") || "", heading),
      title: heading,
    });
  });

  return courses;
}

/**
 * Derive a center_id from a section's class slug or its heading.
 * Prefers an attached slug like "pala-2026" in the section class; falls back
 * to the word after "Dhamma " in the heading; finally "special".
 */
function deriveCenterId(className, heading) {
  const m = /(?:^|\s)([a-z0-9]+)-\d{4}(?:\s|$)/.exec(className.toLowerCase());
  if (m) {
    return m[1];
  }
  const dm = /dhamma\s+([a-z]+)/i.exec(heading);
  if (dm) {
    return dm[1].toLowerCase();
  }
  return "special";
}