/**
 * api/sections.js — Knowledge-base sectioning for the fast path.
 *
 * Parses SKILL.md into its numbered EN/VI sections once (module-cached) and
 * selects only the sections relevant to a request, so knowledge-only answers
 * can be generated from a trimmed prompt (~2-6KB) instead of the full 44KB
 * document. The full tool path still injects the complete knowledge base.
 */
import { KNOWLEDGE_SYSTEM_PROMPT } from "./system-prompt.js";
import { loadKnowledgeBase } from "./knowledge.js";
import { normalize } from "./router.js";

const SECTION_HEADER_RE = /^## (\d{1,2})(-VI)?\.\s+(.+)$/;

/**
 * Split SKILL.md text into numbered sections.
 * Returns [{ id, vi, title, header, text }].
 */
export function parseSections(md) {
  const lines = String(md || "").split("\n");
  const sections = [];
  let current = null;

  for (const line of lines) {
    const m = SECTION_HEADER_RE.exec(line);
    if (m) {
      if (current) {
        sections.push(current);
      }
      current = {
        id: Number(m[1]),
        vi: Boolean(m[2]),
        title: m[3].trim(),
        header: line.trim(),
        text: [],
      };
    } else if (current) {
      current.text.push(line);
    }
  }
  if (current) {
    sections.push(current);
  }

  return sections.map((s) => ({ ...s, text: s.text.join("\n").trim() }));
}

// Keyword → section id index (matched against normalized/diacritic-stripped text).
const SECTION_KEYWORDS = {
  1: ["ucenlist", "unesco", "organization", "tổ chức", "to chuc", "giới thiệu", "gioi thieu", "about"],
  2: ["vipassana", "what is vipassana", "thiền là gì", "thien la gi", "thiền vipassana", "thien vipassana", "buddha", "phật", "phat", "đức phật", "duc phat", "meditation", "thiền", "thien", "thiền định", "thien dinh"],
  3: ["tradition", "truyền thống", "truyen thong", "lineage", "dòng truyền thừa", "dong truyen thua"],
  4: ["goenka", "tiểu sử", "tieu su", "biography"],
  5: ["art of living", "nghệ thuật sống", "nghe thuat song", "philosophy", "triết lý", "triet ly", "equanimity"],
  6: ["giới luật", "gioi luat", "precepts", "code of discipline", "quy tắc", "quy tac", "rules", "noble silence", "tịnh khẩu", "tinh khau", "im lặng", "im lang", "cúng dường", "cung duong", "dana", "ăn chay", "an chay", "vegetarian", "finances", "tài chính", "tai chinh"],
  7: ["timetable", "daily timetable", "daily schedule", "thời khóa biểu", "thoi khoa bieu", "thời gian biểu", "thoi gian bieu", "lịch sinh hoạt", "lich sinh hoat", "4:00", "4 a.m", "wake up", "thức dậy", "thuc day", "lights out", "tắt đèn", "tat den"],
  8: ["faq", "hỏi đáp", "hoi dap", "câu hỏi", "cau hoi", "questions"],
  9: ["trung tâm", "trung tam", "center", "centre", "registration", "đăng ký", "dang ky", "cách đăng ký", "cach dang ky", "how to register", "virocana", "vutthi", "dhamma", "hà nội", "ha noi", "hanoi", "hồ chí minh", "ho chi minh", "hcm", "dhamma pala"],
  10: ["contact", "liên hệ", "lien he", "address", "địa chỉ", "dia chi", "phone", "điện thoại", "dien thoai", "email", "website", "maps", "bản đồ", "ban do"],
};

// Sections always included on the fast path (chatbot behavior + quick facts).
const ALWAYS_ON_SECTIONS = [11, 12, 13];

const _indexed = (() => {
  const map = new Map();
  for (const section of parseSections(loadKnowledgeBase())) {
    if (!map.has(section.id)) {
      map.set(section.id, { en: null, vi: null });
    }
    map.get(section.id)[section.vi ? "vi" : "en"] = section;
  }
  return map;
})();

function getSection(id, lang) {
  const entry = _indexed.get(id);
  if (!entry) {
    return null;
  }
  return entry[lang === "vi" ? "vi" : "en"] || entry.en || entry.vi || null;
}

/**
 * Select the knowledge sections relevant to a request.
 *
 * @param {string} text  the user's latest message
 * @param {'vi'|'en'} lang detected language
 * @returns {string} markdown of the matched sections + always-on guide sections
 */
export function selectSections(text, lang) {
  const n = normalize(text);
  const matched = new Set();

  for (const [id, keywords] of Object.entries(SECTION_KEYWORDS)) {
    if (keywords.some((kw) => n.includes(kw))) {
      matched.add(Number(id));
    }
  }

  // Safe general default when nothing matches.
  if (matched.size === 0) {
    matched.add(1);
    matched.add(2);
  }

  for (const id of ALWAYS_ON_SECTIONS) {
    matched.add(id);
  }

  const parts = [];
  for (const id of [...matched].sort((a, b) => a - b)) {
    const section = getSection(id, lang);
    if (section) {
      parts.push(section.header);
      parts.push(section.text);
    }
  }
  return parts.join("\n\n");
}

/**
 * Build the fast-path system prompt: the standard template with only the
 * relevant knowledge sections injected. Security and handoff instructions in
 * the template are preserved verbatim.
 */
export function buildFastPathSystemPrompt(text, lang) {
  return KNOWLEDGE_SYSTEM_PROMPT.replace("{knowledge_base}", selectSections(text, lang));
}
