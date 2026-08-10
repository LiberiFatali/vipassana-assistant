/**
 * api/sections.js — Knowledge-base sectioning for the fast path.
 *
 * Parses SKILL.md into its numbered EN/VI sections once (module-cached) and
 * selects only the sections relevant to a request, so knowledge-only answers
 * can be generated from a trimmed prompt (~2-6KB) instead of the full 44KB
 * document. The full tool path still injects the complete knowledge base.
 */
import { KNOWLEDGE_SYSTEM_PROMPT } from "./system-prompt.js";
import { loadKnowledgeBase, parseSections } from "./knowledge.js";
import { selectSectionsByRetrieval } from "./retrieval.js";

export { parseSections };

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
 * Section selection is driven by BM25 retrieval over the full section text
 * (see lib/retrieval.js) instead of a fixed keyword map, so paraphrase
 * variants match when they share vocabulary with the section content.
 *
 * @param {string} text  the user's latest message
 * @param {'vi'|'en'} lang detected language
 * @returns {string} markdown of the matched sections + always-on guide sections
 */
export function selectSections(text, lang) {
  const matched = new Set(selectSectionsByRetrieval(text));

  // Safe general default when nothing clears the retrieval score floor.
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
