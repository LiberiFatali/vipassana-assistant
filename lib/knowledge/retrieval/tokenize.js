import { stripDiacritics } from "../../i18n/normalize.js";

/**
 * Shared prep pipeline: diacritic-strip + lowercase, then split into tokens
 * on non-alphanumerics, dropping single-character tokens (function words,
 * punctuation fragments).
 * @param {unknown} text
 * @returns {string[]}
 */
export function tokenize(text) {
  return stripDiacritics(String(text || ""))
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}
