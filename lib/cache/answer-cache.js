/**
 * In-memory TTL cache for generated fast-path answers.
 *
 * Keys are `lang|normalized question` strings; values are the final answer
 * text. Mirrors the ScheduleCache pattern (api/scraper/cache.js): a short
 * bounded Map with a TTL and a size cap so a warm instance can skip repeated
 * LLM calls without unbounded memory growth. Not persisted — Vercel cold
 * starts start empty.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const DEFAULT_MAX_ENTRIES = 500;

export class AnswerCache {
  /**
   * @param {{ttlMs?:number, maxEntries?:number}} [opts]
   */
  constructor({ ttlMs = DEFAULT_TTL_MS, maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
    this._ttl = ttlMs;
    this._max = maxEntries;
    // {key: {answer, ts}}
    /** @type {Map<string, {answer:string, ts:number}>} */
    this._store = new Map();
  }

  /**
   * @param {string} key
   * @returns {string|null}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.ts <= this._ttl) {
      return entry.answer;
    }
    this._store.delete(key);
    return null;
  }

  /**
   * @param {string} key
   * @param {string} answer
   */
  set(key, answer) {
    this._store.delete(key); // refresh insertion order (LRU-ish eviction)
    this._store.set(key, { answer, ts: Date.now() });
    while (this._store.size > this._max) {
      const oldest = this._store.keys().next().value;
      if (oldest !== undefined) this._store.delete(oldest);
    }
  }

  /**
   * @param {string|null} [key]
   */
  clear(key = null) {
    if (key) {
      this._store.delete(key);
    } else {
      this._store.clear();
    }
  }

  get size() {
    return this._store.size;
  }
}

export const answerCache = new AnswerCache();
