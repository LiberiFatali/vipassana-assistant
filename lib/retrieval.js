/**
 * lib/retrieval.js — bilingual BM25 retrieval over the static knowledge base.
 *
 * Builds an in-memory BM25 index once per process over two corpora:
 *   - every EN/VI section of SKILL.md (class "kb", doc id "<n>[-VI]")
 *   - a curated bilingual corpus of live-data (tools) intent exemplars
 *     (class "tools", doc id "tools:<n>")
 *
 * Tokenization reuses the existing diacritic-stripping normalization so
 * Vietnamese typed without diacritics matches ("thoi khoa bieu" ==
 * "thời khóa biểu"), and splits on whitespace — Vietnamese is
 * space-delimited, so no word-segmentation library is needed.
 *
 * The engine (`wink-bm25-text-search`) only loads `wink-helpers` at import;
 * the transitive `wink-nlp`/`wink-eng-lite-web-model` English model is never
 * imported, so cold-start cost stays negligible.
 */
import BM25 from "wink-bm25-text-search";
import { stripDiacritics } from "./normalize.js";
import { loadKnowledgeBase, parseSections } from "./knowledge.js";

// Deterministic classification knobs (tuned against the pinned router tests:
// a bare "khóa thiền"/"course" must stay ambiguous so the LLM classifier is
// still consulted, while clear live-data paraphrases resolve to tools).
export const CLASSIFY_FLOOR = 0.4;
export const CLASSIFY_MARGIN = 1.25;

// Section selection knobs.
export const SECTION_TOP_K = 3;
export const SECTION_SCORE_FLOOR = 0.2;

/**
 * Shared prep pipeline: diacritic-strip + lowercase, then split into tokens
 * on non-alphanumerics, dropping single-character tokens (function words,
 * punctuation fragments).
 */
export function tokenize(text) {
  return stripDiacritics(String(text || ""))
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

// Curated bilingual live-data exemplars (derived from lib/router.js
// TOOLS_STRONG). These give the tools class a retrievable identity because
// the knowledge base itself contains no live-schedule content.
export const TOOLS_EXEMPLARS = [
  // English
  "upcoming courses schedule",
  "what courses are coming up",
  "is the next course full",
  "are there seats available",
  "how do i register for a course",
  "course registration deadline",
  "course start dates this month",
  "next course dates at the center",
  "course availability and apply link",
  "when does the course start",
  "waitlist for the course",
  "course schedule next month",
  // Vietnamese
  "lịch khóa thiền sắp tới",
  "khóa thiền sắp diễn ra trong thời gian tới",
  "khóa thiền tháng này tháng sau",
  "còn chỗ không đăng ký",
  "đăng ký khóa thiền online",
  "hạn chót đăng ký khóa thiền",
  "lịch khai giảng khóa thiền",
  "khóa thiền sắp tới ở hà nội",
  "khóa thiền sắp tới ở hồ chí minh",
  "khi nào khóa thiền bắt đầu",
  "còn chỗ trống trong khóa thiền",
  "danh sách chờ khóa thiền",
];

function buildEngine() {
  const engine = new BM25();
  engine.defineConfig({
    fldWeights: { title: 3, body: 1 },
    bm25Params: { k1: 1.2, b: 0.75 },
  });
  engine.definePrepTasks([tokenize]);

  for (const section of parseSections(loadKnowledgeBase())) {
    // Guide sections 11-13 are always-on on the fast path anyway; indexing
    // them only adds bilingual example-text noise to the rankings.
    if (section.id >= 11) {
      continue;
    }
    const id = section.vi ? `${section.id}-VI` : String(section.id);
    engine.addDoc({ title: section.title, body: section.text }, id);
  }
  TOOLS_EXEMPLARS.forEach((text, i) => {
    engine.addDoc({ title: text, body: text }, `tools:${i}`);
  });
  engine.consolidate();

  return engine;
}

const _engine = buildEngine();

function parseDocId(id) {
  const vi = typeof id === "string" && id.endsWith("-VI");
  const num = vi ? Number(id.slice(0, -3)) : Number(id);
  return { num, vi };
}

/**
 * Rank every index document against a query.
 * Returns [{ id, score, cls }] sorted by descending score, capped at k.
 */
export function retrieve(text, k = 10) {
  return _engine.search(String(text || ""), k).map(([id, score]) => ({
    id,
    score,
    cls: typeof id === "string" && id.startsWith("tools:") ? "tools" : "kb",
  }));
}

/**
 * Deterministic kb-vs-tools classification by retrieval margin.
 * Returns { kind: "kb" | "tools" | "ambiguous", kbScore, toolsScore }.
 */
export function classifyByRetrieval(text) {
  // Fetch enough results to see both classes — tools exemplars are short docs
  // that regularly outscore every long KB section, so a top-10 slice can hide
  // the KB side entirely.
  const results = retrieve(text, 100);
  let kbScore = 0;
  let toolsScore = 0;
  for (const r of results) {
    if (r.cls === "tools" && r.score > toolsScore) toolsScore = r.score;
    if (r.cls === "kb" && r.score > kbScore) kbScore = r.score;
  }

  let kind = "ambiguous";
  if (kbScore >= CLASSIFY_FLOOR && kbScore > toolsScore * CLASSIFY_MARGIN) {
    kind = "kb";
  } else if (toolsScore >= CLASSIFY_FLOOR && toolsScore > kbScore * CLASSIFY_MARGIN) {
    kind = "tools";
  }
  return { kind, kbScore, toolsScore };
}

/**
 * Select the top knowledge sections for a query by retrieval score, in the
 * order the section parser numbers them. Section numbers (not EN/VI variants)
 * are returned so callers resolve language via their existing getSection().\n * Falls back to an empty array when nothing clears the score floor.
 */
export function selectSectionsByRetrieval(text, k = SECTION_TOP_K) {
  const results = retrieve(text, 20).filter((r) => r.cls === "kb");
  if (results.length === 0 || results[0].score < SECTION_SCORE_FLOOR) {
    return [];
  }

  const selected = [];
  const seen = new Set();
  for (const r of results) {
    const { num } = parseDocId(r.id);
    if (seen.has(num)) continue;
    seen.add(num);
    selected.push(num);
    if (selected.length >= k) break;
  }
  return selected;
}

// ─── Center-info intent detection ────────────────────────────────────────────

/**
 * Intent label order — matches index positions used when adding docs to the
 * center-info BM25 engine.
 */
export const CENTER_INFO_INTENT_LABELS = [
  "address",
  "phone",
  "email",
  "website",
  "contact",
  "general",
];

/**
 * One document per intent: carefully crafted representative phrases that
 * use *discriminative* tokens — words that strongly signal one intent and
 * minimise cross-contamination with other intents.
 */
const CENTER_INFO_INTENT_BODIES = [
  // address — navigation, wayfinding, transport, location.
  "dia chi address o dau vi tri toa lac ban do chi duong duong di " +
  "den trung tam di den huong dan xe bus grab taxi google maps directions map location where navigate route find how to get address of",

  // phone — dien thoai, so, phone, hotline, call, telephone
  "so dien thoai dien thoai hotline goi dien so may telephone phone call number ring dial",

  // email — email, mail, thu, send
  "email mail thu dien tu send message inbox email",

  // website — website, web, site, url, link
  "website trang web trang chu web online link url official site website",

  // contact — lien he, contact, reach
  "lien he thong tin lien he contact reach get in touch lien lac contact",

  // general — broad center info (no specific field).
  "thong tin trung tam thien gioi thieu ve trung tam cho biet kham pha tell me about overview introduce information about center",
];

/**
 * Minimum BM25 score for a center-info intent hit. Set to 1.5 to filter out
 * spurious matches from schedule queries (e.g. "khóa thiền sắp tới ở Hà Nội"
 * scores ~1.43) while accepting clear center-info intent hits (which score > 2.0).
 */
export const CENTER_INFO_INTENT_FLOOR = 1.5;

let _centerInfoEngine = null;

function getCenterInfoEngine() {
  if (_centerInfoEngine) return _centerInfoEngine;
  const engine = new BM25();
  engine.defineConfig({ fldWeights: { body: 1 }, bm25Params: { k1: 1.2, b: 0.75 } });
  engine.definePrepTasks([tokenize]);
  CENTER_INFO_INTENT_BODIES.forEach((body, i) => {
    engine.addDoc({ body }, i);
  });
  engine.consolidate();
  _centerInfoEngine = engine;
  return engine;
}

/**
 * Detect which center-info intent a query expresses via BM25 scoring over
 * exemplar documents. Returns one of the CENTER_INFO_INTENT_LABELS strings
 * ("address" | "phone" | "email" | "website" | "contact" | "general") or
 * null if no intent clears the score floor.
 *
 * Center entity detection (which center: virocana/vutthi) is handled
 * separately in lib/quick-answers.js using proper-noun keyword matching;
 * this function only determines *what kind* of information is requested.
 */
export function detectCenterInfoIntent(text) {
  const engine = getCenterInfoEngine();
  const results = engine.search(String(text || ""), CENTER_INFO_INTENT_LABELS.length);
  if (!results || results.length === 0) return null;
  const [idx, score] = results[0];
  if (score < CENTER_INFO_INTENT_FLOOR) return null;
  return CENTER_INFO_INTENT_LABELS[idx] ?? null;
}

