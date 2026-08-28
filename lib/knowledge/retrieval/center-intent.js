/** @ts-ignore - no types for wink-bm25-text-search */
import BM25 from "wink-bm25-text-search";
import { tokenize } from "./tokenize.js";

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
 * separately in lib/chatbot/quick-answers using proper-noun keyword matching;
 * this function only determines *what kind* of information is requested.
 */
/**
 * @param {unknown} text
 * @returns {string|null}
 */
export function detectCenterInfoIntent(text) {
  const engine = getCenterInfoEngine();
  const results = engine.search(String(text || ""), CENTER_INFO_INTENT_LABELS.length);
  if (!results || results.length === 0) return null;
  const [idx, score] = results[0];
  if (score < CENTER_INFO_INTENT_FLOOR) return null;
  return CENTER_INFO_INTENT_LABELS[idx] ?? null;
}
