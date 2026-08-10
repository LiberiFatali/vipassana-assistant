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
import { CENTERS } from "./centers.js";
import { detectLanguage, normalize } from "./router.js";

// Center cues → CENTERS key. Order matters: check multi-center before single.
export const CENTER_CUES = [
  { key: "virocana", keywords: ["virocana", "hà nội", "ha noi", "hanoi", "kim anh", "đồng đò", "dong do"] },
  { key: "vutthi", keywords: ["vutthi", "hồ chí minh", "ho chi minh", "hcm", "củ chi", "cu chi", "trại đèn", "trai den"] },
];

// "Both centers" cues (with no single center named).
export const BOTH_CENTERS_CUES = [
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

// Curated FAQ answers, sourced from SKILL.md section 8 (FAQ) / 12 (QUICK
// REFERENCE). Kept in sync with SKILL.md manually, same as VIPASSANA_DEF_*.
const FAQ_ANSWERS = [
  {
    keywords: [
      "miễn phí", "mien phi", "tốn bao nhiêu", "ton bao nhieu", "giá bao nhiêu",
      "gia bao nhieu", "chi phí", "chi phi", "cúng dường", "cung duong", "dana",
      "donation", "free", "cost", "how much", "how much does it cost", "is it free",
    ],
    vi: "Các khóa thiền Vipassana hoàn toàn miễn phí — không có phí giảng dạy, ăn ở. Mọi khóa học trên toàn thế giới hoạt động dựa trên cơ sở cúng dường tự nguyện: nếu bạn thấy lợi ích, bạn có thể cúng dường vào cuối khóa để hỗ trợ các khóa học trong tương lai.",
    en: "Vipassana courses are completely free — there is no charge for the teaching, room, or board. All courses worldwide run on a strictly voluntary donation basis: if you benefit, you may donate at the end to support future courses.",
  },
  {
    keywords: [
      "ăn chay", "an chay", "đồ ăn", "do an", "thức ăn", "thuc an", "món ăn",
      "vegetarian", "vegan", "diet", "food", "meal",
    ],
    vi: "Trong khóa thiền, các bữa ăn chay đơn giản được cung cấp. Học viên không thể mang thức ăn từ nhà; nếu bác sĩ đã kê đơn chế độ ăn đặc biệt, hãy thông báo cho trung tâm trước.",
    en: "Simple vegetarian meals are provided during the course. Students cannot bring food from home; if your doctor has prescribed a special diet, notify the center in advance.",
  },
  {
    keywords: [
      "điều kiện", "dieu kien", "ai có thể", "ai co the", "ai được", "ai duoc",
      "who can attend", "eligibility", "eligible", "can i attend", "who can join",
      "tham gia được", "tham gia duoc", "conditions",
    ],
    vi: "Bất kỳ ai có sức khỏe thể chất và tâm thần bình thường, có sự quan tâm thật sự và sẵn lòng nỗ lực chân thành đều có thể tham gia. Người quá yếu về thể chất, mắc rối loạn tâm thần nghiêm trọng hoặc đang trải qua xáo trộn cảm xúc lớn có thể không phù hợp.",
    en: "Anyone in reasonable physical and mental health who is genuinely interested and willing to make a sincere effort can attend. Someone physically too weak, suffering from serious psychiatric problems, or undergoing emotional upheaval may not be able to benefit.",
  },
];

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

  // Curated definition (no center required). Broad triggers cover paraphrase
  // variants of the canonical "Vipassana là gì?" / "What is Vipassana?".
  if (
    [
      "vipassana là gì", "vipassana la gi", "thiền vipassana là gì", "thien vipassana la gi",
      "vipassana là", "vipassana la", "giới thiệu về vipassana", "gioi thieu ve vipassana",
      "kể về vipassana", "ke ve vipassana", "kể cho tôi về vipassana", "ke cho toi ve vipassana",
      "thiền vipassana", "thien vipassana", "giới thiệu về thiền vipassana", "gioi thieu ve thien vipassana",
      "what is vipassana", "meaning of vipassana", "vipassana meaning",
      "what is vipassana meditation", "whats vipassana", "tell me about vipassana",
      "about vipassana", "vipassana meditation is", "what is vipassana about",
    ].some((kw) => n.includes(kw))
  ) {
    return detectedLang === "vi" ? VIPASSANA_DEF_VI : VIPASSANA_DEF_EN;
  }

  // Curated FAQ answers (free/donation, diet, eligibility) — no center needed.
  const faq = FAQ_ANSWERS.find((f) => f.keywords.some((kw) => n.includes(kw)));
  if (faq) {
    return detectedLang === "vi" ? faq.vi : faq.en;
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
