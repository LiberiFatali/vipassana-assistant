/**
 * AI SDK tool: get_course_details
 *
 * Fetches supplementary information for a specific course from the VRI website.
 * Use this after list_courses to get eligibility requirements and special instructions.
 * Port of the original Python tool module of the same name.
 */
import * as cheerio from "cheerio";
import { z } from "zod";
import { ScraperError, fetch_html } from "../scraper/vri-schedule.js";

export const getCourseDetailsInputSchema = z.object({
  apply_url: z
    .string()
    .describe("The apply_url from a list_courses result. Must be a schedule.vridhamma.org URL."),
});

/**
 * Fetches additional details for a specific Vipassana course from its VRI page.
 *
 * Use the apply_url returned by list_courses. This tool retrieves:
 * - special_instructions: Any specific instructions for this course
 * - eligibility: Who can attend (new students, old students only, etc.)
 * - comments: Bilingual notes, language of instruction, etc.
 * - registration_notes: Deadlines or other registration information
 *
 * Returns an error key if the page cannot be fetched.
 */
export async function getCourseDetails(input) {
  const { apply_url } = getCourseDetailsInputSchema.parse(input);

  if (!apply_url || !apply_url.startsWith("http")) {
    return {
      apply_url,
      error: "Invalid URL — must be a full URL starting with http(s).",
    };
  }

  let html;
  try {
    html = await fetch_html(apply_url);
  } catch (err) {
    return {
      apply_url,
      error: err instanceof ScraperError ? err.message : String(err && err.message ? err.message : err),
    };
  }

  return _parse_detail_page(html, apply_url);
}

/**
 * Parse a VRI course detail/apply page for supplementary information.
 */
export function _parse_detail_page(html, apply_url) {
  const $ = cheerio.load(html);

  const result = {
    apply_url,
    special_instructions: "",
    eligibility: "",
    comments: "",
    registration_notes: "",
  };

  // Try to extract text from the main content area
  let content = $("#content");
  if (content.length === 0) {
    content = $(".course-listing");
  }
  if (content.length === 0) {
    content = $("main");
  }
  if (content.length === 0) {
    content = $("body");
  }

  if (content.length > 0) {
    // Look for announcement / notes blocks
    content.find("p, div, li").each((_i, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const textLower = text.toLowerCase();

      if (!text || text.length < 10) {
        return;
      }

      if (["old student", "học viên cũ", "đã hoàn thành"].some((kw) => textLower.includes(kw))) {
        result.eligibility = text;
      } else if (["bilingual", "song ngữ", "language", "ngôn ngữ"].some((kw) => textLower.includes(kw))) {
        result.comments = text;
      } else if (["registration", "đăng ký", "deadline", "hạn chót"].some((kw) => textLower.includes(kw))) {
        result.registration_notes = text;
      } else if (["note", "instruction", "lưu ý", "hướng dẫn"].some((kw) => textLower.includes(kw))) {
        result.special_instructions = text;
      }
    });
  }

  return result;
}
