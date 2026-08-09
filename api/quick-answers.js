/**
 * api/quick-answers.js — Deterministic structured answers for the KB fast path.
 *
 * Answers well-defined factual queries (center address/phone/email/website and
 * the curated "Vipassana là gì" definition) with NO LLM call, in <100ms, from
 * lib/centers.js (the existing single source of truth for center data).
 *
 * Matching is deliberately strict: a center AND an info keyword must both match
 * (or a definition trigger must match) for an answer to be returned; anything
 * else returns null and falls through to the normal LLM fast path.
 *
 * Output is markdown text; callers still route it through sanitize_urls() so
 * the trusted-domain gate is enforced on every response path.
 */
import { CENTERS } from "../lib/centers.js";
import { detectLanguage, normalize } from "./router.js";

// Center cues → CENTERS key. Order matters: check multi-center before single.
const CENTER_CUES = [
  { key: "virocana", keywords: ["virocana", "hà nội", "ha noi", "hanoi", "kim anh", "đồng đò", "dong do"] },
  { key: "vutthi", keywords: ["vutthi", "hồ chí minh", "ho chi minh", "hcm", "củ chi", "cu chi", "trại đèn", "trai den"] },
];

// "Both centers" cues (with no single center named).
const BOTH_CENTERS_CUES = [
  "các trung tâm", "cac trung tam", "hai trung tâm", "hai trung tam",
  "2 trung tâm", "2 trung tam", "cả hai trung tâm", "ca hai trung tam",
  "both centers", "both centres", "all centers", "all centres",
  "hai trung tam", "cả 2 trung tâm", "ca 2 trung tam",
];

// Info keyword groups → which center fields to include in the answer.
const INFO_GROUPS = {
  address: {
    keywords: ["địa chỉ", "dia chi", "address", "ở đâu", "o dau", "vị trí", "vi tri", "tọa lạc", "toa lac", "tọa lạc tại", "where is"],
    fields: ["address"],
  },
  phone: {
    keywords: ["điện thoại", "dien thoai", "số điện thoại", "so dien thoai", "hotline", "phone"],
    fields: ["phone"],
  },
  email: {
    keywords: ["email", "e-mail", "mail", "thư điện tử", "thu dien tu"],
    fields: ["email"],
  },
  website: {
    keywords: ["website", "trang web", "trang chủ", "trang chu", "web"],
    fields: ["website"],
  },
  contact: {
    keywords: ["liên hệ", "lien he", "contact", "thông tin liên lạc", "thong tin lien lac", "info"],
    fields: ["phone", "email"],
  },
};

const VIPASSANA_DEF_VI =
  "Vipassana (Thiền Minh Sát) là một phương pháp thiền cổ xưa của Ấn Độ được dạy lại bởi S.N. Goenka, giúp hành giả quan sát thực tế bên trong chính mình bằng cách chú tâm vào hơi thở và cảm giác để phát triển sự bình tĩnh, cân bằng và hiểu biết sâu sắc về bản chất của hiện tượng. Nó là một kỹ thuật không tôn giáo, áp dụng cho tất cả mọi người.";

const VIPASSANA_DEF_EN =
  "Vipassana is an ancient Indian meditation technique, as taught by S.N. Goenka, that means 'to see things as they really are'. By observing the breath and bodily sensations, practitioners develop equanimity, self-awareness, and deep insight into the impermanent nature of phenomena. It is a non-sectarian technique open to people of all backgrounds.";

function infoGroupFor(text) {
  for (const [group, spec] of Object.entries(INFO_GROUPS)) {
    if (spec.keywords.some((kw) => text.includes(kw))) {
      return group;
    }
  }
  return null;
}

function centerKeysFor(text) {
  const hits = new Set();
  for (const cue of CENTER_CUES) {
    if (cue.keywords.some((kw) => text.includes(kw))) {
      hits.add(cue.key);
    }
  }
  return hits;
}

function bothCenters(text) {
  return BOTH_CENTERS_CUES.some((kw) => text.includes(kw));
}

function formatCenter(center, lang) {
  const c = CENTERS[center];
  const city = lang === "vi" ? c.city_vi : c.city;
  const name = c.name;
  return {
    heading: `**${name}** — ${city}`,
    address: c.address,
    phone: c.phone,
    email: c.email,
    website: c.website,
    schedule: lang === "vi" ? c.schedule_url_vi : c.schedule_url_en,
  };
}

function renderCenterInfo(centers, group, lang) {
  const lines = [];
  for (const key of centers) {
    const info = formatCenter(key, lang);
    lines.push(info.heading);
    if (group === "address") {
      lines.push(`- **${lang === "vi" ? "Địa chỉ" : "Address"}:** ${info.address}`);
    } else if (group === "phone") {
      lines.push(`- **${lang === "vi" ? "Điện thoại" : "Phone"}:** ${info.phone}`);
    } else if (group === "email") {
      lines.push(`- **Email:** ${info.email}`);
    } else if (group === "website") {
      lines.push(`- **Website:** ${info.website}`);
    } else if (group === "contact") {
      lines.push(`- **${lang === "vi" ? "Điện thoại" : "Phone"}:** ${info.phone}`);
      lines.push(`- **Email:** ${info.email}`);
      lines.push(`- **Website:** ${info.website}`);
    }
    lines.push(`- **${lang === "vi" ? "Lịch khóa" : "Course schedule"}:** ${info.schedule}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

/**
 * Return a deterministic answer for high-confidence factual queries, or null
 * to fall through to the LLM fast path.
 *
 * @param {string} text  the user's latest message
 * @param {'vi'|'en'} lang detected language
 * @returns {string|null}
 */
export function getQuickAnswer(text, lang) {
  const n = normalize(text);
  const detectedLang = lang === "vi" ? "vi" : "en";

  // Curated definition (no center required).
  if (
    ["vipassana là gì", "vipassana la gi", "thiền vipassana là gì", "thien vipassana la gi"].some((kw) => n.includes(kw)) ||
    ["what is vipassana", "meaning of vipassana", "vipassana meaning", "what is vipassana meditation", "whats vipassana"].some((kw) => n.includes(kw))
  ) {
    return detectedLang === "vi" ? VIPASSANA_DEF_VI : VIPASSANA_DEF_EN;
  }

  // Center info queries: require at least one center AND one info group
  // (or an explicit "both centers" cue).
  const group = infoGroupFor(n);
  if (!group) {
    return null;
  }
  const centers = centerKeysFor(n);
  if (centers.size === 0 && !bothCenters(n)) {
    return null;
  }

  let selected;
  if (centers.size === 2 || bothCenters(n) || centers.size === 0) {
    selected = ["virocana", "vutthi"];
  } else {
    selected = [...centers];
  }

  return renderCenterInfo(selected, group, detectedLang);
}
