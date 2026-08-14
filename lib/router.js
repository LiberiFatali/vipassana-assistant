/**
 * api/router.js — Intent router for the Vipassana UCENLIST chatbot.
 *
 * Classifies the latest user message into one of two response paths:
 *   - "kb":    knowledge-only — answerable from the static SKILL.md (fast path)
 *   - "tools": requires live course data (tool path)
 *
 * Classification is bilingual (English/Vietnamese) and deliberately
 * conservative: strong live-data signals always route to the tool path, and
 * ambiguous requests are resolved by a tiny LLM classifier that defaults to
 * the tool path on timeout/failure. A misroute to the tool path only costs
 * latency; a misroute to the fast path could serve stale data — so we bias
 * toward tools whenever uncertain.
 */
import { stripDiacritics } from "./normalize.js";
import { classifyByRetrieval } from "./retrieval.js";
import { chatCompletion } from "./llm.js";

// Conservative classifier budget. The tiny max_tokens is intentional: some
// free reasoning models consume the token budget on `reasoning_content` before
// any content, so a meaningful classifier answer is not reliably achievable
// within a short timeout. We keep the 2.5s deadline and let a timeout (or an
// empty response, which usually means the budget was burned on reasoning) fall
// back to the tool path (conservative: extra latency, never wrong data). The
// tool path succeeds with the fast default model, so a misrouted knowledge
// question still gets a real answer.
export const CLASSIFIER_TIMEOUT_MS = 2500;
export const CLASSIFIER_MAX_TOKENS = 8;

// ─── Text normalization ──────────────────────────────────────────────────────

/**
 * Lowercase + strip Vietnamese diacritics so matching is robust to
 * diacritic-free Vietnamese typing ("thoi khoa bieu" == "thời khóa biểu").
 */
export function normalize(text) {
  return stripDiacritics(String(text || "")).toLowerCase();
}

// ─── Signal tables (all lowercase, diacritic-stripped) ───────────────────────

// Highest-priority KB phrases: daily timetable and history words that must
// never be mistaken for live-schedule signals.
const KB_SPECIFIC = [
  "thời khóa biểu", "thoi khoa bieu", "thời gian biểu", "thoi gian bieu",
  "lịch sinh hoạt", "lich sinh hoat",
  "daily timetable", "daily schedule", "timetable",
  "lịch sử", "lich su", "history",
];

// Strong live-data signals → route to the tool path.
const TOOLS_STRONG = [
  // English
  "schedule", "upcoming", "next course", "registration", "register",
  "apply", "deadline", "waitlist", "wait list", "spots", "seats",
  "availability", "open course", "start date", "course dates", "this month",
  "next month", "when is", "when's", "full", "is the course full",
  // Vietnamese
  "lịch khai giảng", "lich khai giang", "khai giảng", "khai giang",
  "đăng ký", "dang ky", "đăng kí", "dang ki", "ghi danh",
  "sắp tới", "sap toi", "kế tiếp", "ke tiep", "khóa sắp", "khoa sap",
  "tháng này", "thang nay", "tháng sau", "thang sau",
  "khi nào", "khi nao", "ngày khai giảng", "ngay khai giang", "hạn chót", "han chot",
  "còn chỗ", "con cho", "hết chỗ", "het cho", "đã đầy", "da day",
  "danh sách chờ", "danh sach cho", "chỗ trống", "cho trong", "kín chỗ", "kin cho",
];

// Strong knowledge-base signals → route to the fast path.
const KB_STRONG = [
  // English
  "vipassana is", "what is vipassana", "meaning of vipassana",
  "goenka", "biography", "art of living", "philosophy", "equanimity",
  "precepts", "code of discipline", "rules", "noble silence", "silence",
  "wake up", "wake-up", "lights out", "4:00", "4 a.m", "4am",
  "faq", "questions", "anapana", "donation", "dana", "vegetarian", "diet",
  "who can attend", "eligibility", "mental", "free of charge", "free",
  "non-sectarian", "nonsectarian", "religion", "contact", "address", "phone",
  "email", "website", "directions", "map", "tradition", "lineage", "buddha",
  "meditation", "how to meditate", "benefit",
  // Vietnamese
  "thiền là gì", "thien la gi", "vipassana là gì", "vipassana la gi",
  "tiểu sử", "tieu su", "nghệ thuật sống", "nghe thuat song", "triết lý", "triet ly",
  "giới luật", "gioi luat", "quy tắc", "quy tac", "giới", "gioi",
  "tịnh khẩu", "tinh khau", "im lặng", "im lang",
  "thức dậy", "thuc day", "tắt đèn", "tat den",
  "hỏi đáp", "hoi dap", "câu hỏi", "cau hoi",
  "cúng dường", "cung duong", "ăn chay", "an chay", "miễn phí", "mien phi",
  "điều kiện", "dieu kien", "sức khỏe", "suc khoe", "tôn giáo", "ton giao",
  "liên hệ", "lien he", "địa chỉ", "dia chi", "điện thoại", "dien thoai",
  "bản đồ", "ban do", "đường đi", "duong di", "chỉ đường", "chi duong",
  "hướng dẫn đi", "huong dan di", "cách đi", "cach di", "directions",
  "truyền thống", "truyen thong", "đức phật", "duc phat", "phật", "phat",
  "lợi ích", "loi ich", "hành thiền", "hanh thien",
];

// Ambiguous signals — a bare course/center mention with no schedule or
// knowledge intent keyword; resolved by the LLM classifier.
const AMBIGUOUS = [
  "course", "courses", "meditation course", "ten day", "10 day",
  "satipatthana", "center", "centre", "virocana", "vutthi", "dhamma",
  "pala", "bodh gaya", "bodhgaya",
  "learn to meditate",
  "khóa thiền", "khoa thien", "khóa", "khoa", "trung tâm", "trung tam",
  "thiền 10 ngày", "thien 10 ngay",
];

function includesAny(text, signals) {
  return signals.some((sig) => text.includes(sig));
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
 */
export function detectLanguage(text) {
  const t = String(text || "");
  if (VI_DIACRITIC_RE.test(t)) {
    return "vi";
  }
  const n = normalize(t);
  if (
    VI_WORDS.some((w) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(n))
  ) {
    return "vi";
  }
  return "en";
}

// ─── Local (deterministic) classification ────────────────────────────────────

/**
 * Synchronous keyword classification. Returns:
 *   { kind: "kb" | "tools" | "ambiguous", lang: "vi" | "en" }
 */
export function classifyLocal(text) {
  const n = normalize(text);
  const lang = detectLanguage(text);

  if (includesAny(n, KB_SPECIFIC)) {
    return { kind: "kb", lang };
  }
  if (includesAny(n, TOOLS_STRONG)) {
    return { kind: "tools", lang };
  }
  if (includesAny(n, KB_STRONG)) {
    return { kind: "kb", lang };
  }
  if (includesAny(n, AMBIGUOUS)) {
    return { kind: "ambiguous", lang };
  }
  return { kind: "kb", lang };
}

// ─── LLM classifier fallback (ambiguous → tools|kb) ──────────────────────────

const CLASSIFIER_SYSTEM_PROMPT =
  "You are a strict request router for a Vipassana meditation chatbot. " +
  "Reply with exactly one word: TOOLS or KNOWLEDGE.\n" +
  "Reply TOOLS if the request needs live course schedule data (course dates, " +
  "availability, registration links, upcoming courses).\n" +
  "Reply KNOWLEDGE if the request can be answered from static knowledge " +
  "(what Vipassana is, course rules and discipline, daily timetable, S.N. Goenka " +
  "biography, center contact information, FAQs).";

/**
 * Resolve an ambiguous request with a tiny LLM call through lib/llm.js.
 * Returns "tools" on any failure/timeout, or when the model produces no usable
 * content (e.g. a thinking model burns the tiny `max_tokens` budget on
 * reasoning) — conservative: extra latency, never wrong data.
 */
async function classifyWithLLM(text) {
  try {
    const data = await chatCompletion(
      [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      { maxTokens: CLASSIFIER_MAX_TOKENS, temperature: 0, timeoutMs: CLASSIFIER_TIMEOUT_MS }
    );
    const content =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "";
    const answer = String(content || "").trim().toUpperCase();
    if (!answer) {
      // No usable content — treat as a failure, not as KNOWLEDGE.
      return "tools";
    }
    return answer.startsWith("TOOLS") ? "tools" : "kb";
  } catch {
    return "tools";
  }
}

/**
 * Full classification: local keywords first, then deterministic retrieval,
 * with the LLM classifier as the final fallback for low-confidence requests.
 * Returns { kind: "kb" | "tools", lang }.
 *
 * The retrieval stage resolves many ambiguous requests without an LLM call:
 * it compares the best knowledge-section score against the best tools-exemplar
 * score (see lib/retrieval.js). When retrieval cannot decide within its
 * margin, the LLM classifier decides — still defaulting to the tool path on
 * timeout/failure, so the conservative bias is preserved.
 */
export async function classifyIntent(text) {
  const local = classifyLocal(text);
  if (local.kind !== "ambiguous") {
    return local;
  }

  const retrieval = classifyByRetrieval(text);
  if (retrieval.kind !== "ambiguous") {
    return { kind: retrieval.kind, lang: local.lang };
  }

  const kind = await classifyWithLLM(text);
  return { kind, lang: local.lang };
}
