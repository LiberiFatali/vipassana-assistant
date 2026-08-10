/**
 * In-memory TTL cache for course schedule data.
 * Port of the original Python cache module.
 *
 * Layered fallback strategy:
 *   1. Live scrape (primary)  → TTL: 10 minutes in-memory
 *   2. Cached scrape          → Returns last successful scrape result within 24h
 *   3. Static fallback JSON   → lib/fallback-schedule.json (manually maintained)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FALLBACK_PATH = fileURLToPath(
  new URL("../../lib/fallback-schedule.json", import.meta.url)
);

/**
 * Two-tier in-memory cache for VRI course schedule data.
 *
 * Tier 1: Short-TTL cache (default 10 min) — used for de-duplicating requests.
 * Tier 2: Long-TTL cache (default 24h) — used as fallback when scrape fails.
 */
export class ScheduleCache {
  constructor(ttl_minutes = 10, fallback_ttl_hours = 24) {
    this._ttl = ttl_minutes * 60 * 1000;
    this._fallback_ttl = fallback_ttl_hours * 60 * 60 * 1000;

    // {key: [courses, timestampMs]}
    this._store = new Map();
  }

  /**
   * Return cached value if within short TTL, else null.
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      return null;
    }
    const [courses, timestamp] = entry;
    if (Date.now() - timestamp <= this._ttl) {
      return courses;
    }
    return null;
  }

  /**
   * Store courses with current UTC timestamp.
   */
  set(key, courses) {
    this._store.set(key, [courses, Date.now()]);
  }

  /**
   * Return cached value even if short TTL expired, as long as within fallback TTL.
   * Used when live scrape fails — prefer stale data over static fallback.
   */
  get_stale(key) {
    const entry = this._store.get(key);
    if (!entry) {
      return null;
    }
    const [courses, timestamp] = entry;
    if (Date.now() - timestamp <= this._fallback_ttl) {
      return courses;
    }
    return null;
  }

  /**
   * Load courses from lib/fallback-schedule.json filtered by center_id.
   * Returns [] if the file is missing or malformed.
   */
  get_fallback(center_id) {
    try {
      const data = JSON.parse(readFileSync(FALLBACK_PATH, "utf-8"));
      const courses = data.courses || [];
      return courses.filter((c) => c.center_id === center_id);
    } catch {
      return [];
    }
  }

  /**
   * Attempt to return data in this priority order:
   *   1. Stale cache (within 24h)  → freshness = "cached"
   *   2. Static fallback JSON      → freshness = "fallback"
   *
   * Returns [courses, freshness_label].
   */
  get_or_fallback(key, center_id) {
    const stale = this.get_stale(key);
    if (stale !== null) {
      return [stale, "cached"];
    }

    const fallback = this.get_fallback(center_id);
    return [fallback, "fallback"];
  }

  /**
   * Clear one key or the entire cache.
   */
  clear(key = null) {
    if (key) {
      this._store.delete(key);
    } else {
      this._store.clear();
    }
  }
}
