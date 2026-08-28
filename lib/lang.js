/**
 * lib/lang.js — Single source of truth for bilingual language handling.
 *
 * Leaf module (depends only on lib/normalize.js) that defines the `Lang`
 * type, runtime constants, and the `normalize`/`detectLanguage` helpers.
 * All other modules should import `Lang` and helpers from here instead of
 * duplicating `"vi"|"en"` unions or re-implementing detection.
 */

import { stripDiacritics } from "./normalize.js";

export const LANG_VI = "vi";
export const LANG_EN = "en";
export const LANGS = /** @type {const} */ ([LANG_VI, LANG_EN]);

/**
 * @typedef {typeof LANGS[number]} Lang
 * Language code: "vi" (Vietnamese) or "en" (English).
 */

/**
 * @param {unknown} v
 * @returns {v is Lang}
 */
export function isLang(v) {
  return v === LANG_VI || v === LANG_EN;
}

/**
 * Coerce an unknown value to Lang, falling back to `fallback`.
 * @param {unknown} v
 * @param {Lang} [fallback]
 * @returns {Lang}
 */
export function coerceLang(v, fallback = LANG_VI) {
  return isLang(v) ? v : fallback;
}

/**
 * Lowercase + strip Vietnamese diacritics so matching is robust to
 * diacritic-free Vietnamese typing ("thoi khoa bieu" == "thời khóa biểu").
 * @param {unknown} text
 * @returns {string}
 */
export function normalize(text) {
  return stripDiacritics(String(text || "")).toLowerCase();
}

// ─── Language detection ──────────────────────────────────────────────────────

const VI_DIACRITIC_RE =
  /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/;

const VI_WORDS = [
  "thiền", "thien", "khóa", "khoa", "trung tâm", "trung tam", "giới", "gioi",
  "ngày", "ngay", "của", "cua", "và", "va", "là", "la", "với", "voi",
  "các", "cac", "có", "co", "không", "khong", "được", "duoc", "bạn", "ban",
  "học viên", "hoc vien", "liên hệ", "lien he", "địa chỉ", "dia chi",
  "xin", "chào", "chao", "tôi", "toi", "bằng", "bang", "tiếng", "tieng",
];

/**
 * Heuristic language detection: Vietnamese if the text carries Vietnamese
 * diacritics or Vietnamese stopwords (matched as whole words), otherwise
 * English. Word-boundary matching avoids false positives like "co" inside
 * "course".
 * @param {unknown} text
 * @returns {Lang}
 */
export function detectLanguage(text) {
  const t = String(text || "");
  if (VI_DIACRITIC_RE.test(t)) {
    return LANG_VI;
  }
  const n = normalize(t);
  if (
    VI_WORDS.some((w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(n))
  ) {
    return LANG_VI;
  }
  return LANG_EN;
}
