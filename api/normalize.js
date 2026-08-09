/**
 * api/normalize.js — shared text-normalization helpers.
 */

/**
 * Strip Vietnamese diacritics (and Latin combining marks) from a string so
 * matching is robust to diacritic-free Vietnamese typing.
 *
 * "thời khóa biểu" → "thoi khoa bieu", "Đức Phật" → "Duc Phat".
 */
export function stripDiacritics(text) {
  return String(text || "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
