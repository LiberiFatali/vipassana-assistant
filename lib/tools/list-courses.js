/**
 * AI SDK tool: list_courses
 *
 * Returns upcoming Vipassana courses at UCENLIST centers in Vietnam.
 * Scrapes schedule.vridhamma.org with a 10-minute cache and falls back
 * to stale cache or static JSON on failure.
 * Port of the original Python tool module of the same name.
 */
import { z } from "zod";
import { ScheduleCache } from "../scraper/cache.js";
import { ScraperError, fetch_courses } from "../scraper/vri-schedule.js";
import { logError, logInfo, logWarn, safeErr } from "../log.js";

export const listCoursesInputSchema = z.object({
  center: z
    .enum(["virocana", "vutthi", "all"])
    .default("all")
    .describe(
      "Which center to query: 'virocana' (Ha Noi / Hà Nội), 'vutthi' (Ho Chi Minh City / TP. HCM), or 'all' for both."
    ),
  language: z
    .enum(["vi", "en"])
    .default("vi")
    .describe("Language for schedule page: 'vi' for Vietnamese, 'en' for English."),
  course_type: z
    .string()
    .optional()
    .describe("Optional filter by course type, e.g. '10-day', 'short', 'satipatthana'. Leave empty for all types."),
});

const _cache = new ScheduleCache(10);

// In-flight dedup: concurrent identical (center, language) scrapes share one
// fetch. Keyed by `${center}_${language}`; entries are removed on settle.
const _inflight = new Map();

function fetchCoursesDedup(center_id, language) {
  const key = `${center_id}_${language}`;
  if (_inflight.has(key)) {
    return _inflight.get(key);
  }
  const pending = fetch_courses(center_id, language).finally(() => _inflight.delete(key));
  _inflight.set(key, pending);
  return pending;
}

/**
 * Returns upcoming Vipassana meditation courses at UCENLIST centers.
 *
 * Each course includes:
 * - center: Center name (e.g. 'Dhamma Virocana')
 * - center_id: 'virocana' or 'vutthi'
 * - location: City (e.g. 'Ha Noi')
 * - type: Course type (e.g. '10-day', 'short', 'satipatthana')
 * - start_date: Start date in YYYY-MM-DD format
 * - end_date: End date in YYYY-MM-DD format
 * - status: 'open', 'full', 'waitlist', or 'unknown'
 * - apply_url: Direct link to register on the VRI website
 * - notes: Any special instructions or eligibility notes
 * - data_freshness: 'live', 'cached', or 'fallback'
 *
 * When data_freshness is 'fallback', dates are approximate — direct the
 * user to check schedule.vridhamma.org for the current schedule.
 */
export async function listCourses(input) {
  const { center, language, course_type } = listCoursesInputSchema.parse(input);

  const centersToQuery = center === "all" ? ["virocana", "vutthi"] : [center];

  const results = await Promise.all(
    centersToQuery.map(async (c) => {
      const cacheKey = `${c}_${language}`;
      let courses;
      const t0 = Date.now();

      const cached = _cache.get(cacheKey);
      if (cached !== null) {
        courses = cached.map((course) => ({ ...course, data_freshness: "cached" }));
        logInfo("schedule.fetch", {
          centerId: c,
          freshness: "cached",
          count: courses.length,
          latencyMs: Date.now() - t0,
        });
      } else {
        try {
          courses = await fetchCoursesDedup(c, language);
          _cache.set(cacheKey, courses);
          courses = courses.map((course) => ({ ...course, data_freshness: "live" }));
          logInfo("schedule.fetch", {
            centerId: c,
            freshness: "live",
            count: courses.length,
            latencyMs: Date.now() - t0,
          });
        } catch (err) {
          if (!(err instanceof ScraperError)) {
            logError("schedule.fetch-error", { centerId: c, ...safeErr(err) });
            throw err;
          }
          const [fallbackCourses, freshness] = _cache.get_or_fallback(cacheKey, c);
          courses = fallbackCourses.map((course) => ({ ...course, data_freshness: freshness }));
          logWarn("schedule.fetch-error", { centerId: c, ...safeErr(err) });
          logInfo("schedule.fetch", {
            centerId: c,
            freshness,
            count: courses.length,
            latencyMs: Date.now() - t0,
          });
        }
      }

      // Filter by course_type if requested
      if (course_type) {
        const typeLower = course_type.toLowerCase();
        courses = courses.filter((item) =>
          String(item.type || "").toLowerCase().includes(typeLower)
        );
      }

      return courses;
    })
  );

  const flattened = results.flat();

  // Sort by start_date ascending (empty strings sort last)
  flattened.sort((a, b) =>
    String(a.start_date || "9999").localeCompare(String(b.start_date || "9999"))
  );

  return flattened;
}
