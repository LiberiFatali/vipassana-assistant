/**
 * lib/out-of-scope.js — Deterministic out-of-scope fallback for the fast path.
 *
 * Answers clearly out-of-scope factual questions (meditation groups, clubs,
 * communities) with a static bilingual "I don't have this information — contact
 * the UCENLIST meditation center / admin team" message, with NO LLM call.
 *
 * Matching is deliberately narrow: only specific multi-word patterns fire, so
 * in-scope vocabulary ("khóa thiền", "đăng ký theo nhóm", "hỏi thiền") can
 * never be hijacked. Note "hội thiền" is intentionally NOT a pattern because
 * it normalizes identically to "hỏi thiền" (e.g. "Cho tôi hỏi thiền là gì?").
 * Anything that does not match returns null and falls through to routing.
 */
import { normalize } from "./router.js";

// Normalized (lowercase, diacritic-stripped) multi-word patterns for
// meditation group/club/community topics — outside the knowledge base and not
// live course schedules.
export const OOS_PATTERNS = [
  "nhom thien",
  "thien nhom",
  "nhom thien dinh",
  "cau lac bo thien",
  "cong dong thien",
  "thien cung nhau",
  "meditation group",
  "meditation club",
  "group meditation",
  "group vipassana",
];

const OOS_ANSWER_VI =
  "Xin lỗi, mình không có thông tin về điều này trong cơ sở dữ liệu hiện tại. Để biết thêm thông tin, bạn vui lòng liên hệ Trung tâm thiền UCENLIST hoặc ban quản trị qua email info@ucenlist.org nhé.";

const OOS_ANSWER_EN =
  "Sorry, I don't currently have information about this in my database. For more information, please contact the UCENLIST meditation center or the admin team at info@ucenlist.org.";

/**
 * Return true when the text clearly asks about something outside the
 * knowledge base (meditation groups/clubs/communities).
 */
export function detectOutOfScope(text) {
  const n = normalize(text);
  return OOS_PATTERNS.some((p) => n.includes(p));
}

/**
 * Return the static bilingual fallback answer for a clearly out-of-scope
 * question, or null to fall through to normal routing.
 */
export function getOutOfScopeAnswer(text, lang) {
  if (!detectOutOfScope(text)) {
    return null;
  }
  return lang === "vi" ? OOS_ANSWER_VI : OOS_ANSWER_EN;
}
