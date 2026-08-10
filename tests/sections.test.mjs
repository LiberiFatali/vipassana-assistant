/**
 * tests/sections.test.mjs — unit tests for knowledge-base sectioning and the
 * fast-path system prompt.
 *
 * Run: node --test tests/sections.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadKnowledgeBase } from "../lib/knowledge.js";
import { KNOWLEDGE_SYSTEM_PROMPT } from "../lib/system-prompt.js";
import { buildFastPathSystemPrompt, parseSections, selectSections } from "../lib/sections.js";

const FULL_KB = loadKnowledgeBase();

function fullKnowledgePrompt() {
  return KNOWLEDGE_SYSTEM_PROMPT.replace("{knowledge_base}", FULL_KB);
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

test("parse: SKILL.md yields all numbered EN/VI sections", () => {
  const sections = parseSections(FULL_KB);
  assert.ok(sections.length >= 25, `expected >=25 sections, got ${sections.length}`);
  const ids = sections.map((s) => `${s.id}${s.vi ? "-VI" : ""}`);
  assert.ok(ids.includes("1") && ids.includes("1-VI"), "both EN and VI section 1 exist");
  assert.ok(ids.includes("13"), "English section 13 exists");
  assert.ok(!ids.includes("13-VI"), "no VI variant for section 13");
});

// ─── Section selection ───────────────────────────────────────────────────────

test("select: English what-is-Vipassana selects section 2 plus guide sections", () => {
  const out = selectSections("What is Vipassana?", "en");
  assert.ok(out.includes("## 2. WHAT IS VIPASSANA"), "contains EN section 2");
  assert.ok(out.includes("KEY PRINCIPLES"), "always-on section 11");
  assert.ok(out.includes("QUICK REFERENCE"), "always-on section 12");
  assert.ok(out.includes("LANGUAGE BEHAVIOR GUIDE"), "always-on section 13");
  assert.ok(!out.includes("## 6-VI."), "does not pull the Vietnamese rules section");
});

test("select: Vietnamese discipline-rules question selects the VI section", () => {
  const out = selectSections("Nội quy giới luật của khóa thiền 10 ngày?", "vi");
  assert.ok(out.includes("## 6-VI."), "contains VI section 6");
  assert.ok(out.includes("GIỚI LUẬT"), "contains the VI discipline content");
});

test("select: daily timetable selects the timetable section, not course schedule", () => {
  const out = selectSections("What is the daily timetable?", "en");
  assert.ok(out.includes("## 7. THE DAILY TIMETABLE"), "contains section 7");
});

test("select: unknown text falls back to general default sections", () => {
  const out = selectSections("zzzqwerty", "en");
  assert.ok(out.includes("## 1. ABOUT UCENLIST") || out.includes("## 2. WHAT IS VIPASSANA"));
});

test("select: VI paraphrase without keyword matches selects the discipline section", () => {
  const out = selectSections("Những điều được phép và không được phép trong khóa thiền?", "vi");
  assert.ok(out.includes("## 6-VI."), "contains VI section 6");
  assert.ok(out.includes("GIỚI LUẬT"), "contains the VI discipline content");
});

test("select: EN daily-routine paraphrase selects FAQ instead of the default", () => {
  const out = selectSections("How does a normal day look inside the course?", "en");
  assert.ok(out.includes("## 8. QUESTIONS AND ANSWERS (FAQ)"), "contains section 8");
});

test("select: output is substantially smaller than the full knowledge base", () => {
  const out = selectSections("What is Vipassana?", "en");
  assert.ok(out.length < FULL_KB.length / 2, `selected ${out.length}B vs full ${FULL_KB.length}B`);
});

// ─── Fast-path system prompt ─────────────────────────────────────────────────

test("fast-path prompt: trims the knowledge base vs the full prompt", () => {
  const fast = buildFastPathSystemPrompt("What is Vipassana?", "en");
  const full = fullKnowledgePrompt();
  assert.ok(fast.length < full.length, `fast ${fast.length}B vs full ${full.length}B`);
});

test("fast-path prompt: preserves security and handoff instructions", () => {
  const fast = buildFastPathSystemPrompt("What is Vipassana?", "en");
  assert.ok(fast.includes("⚠️"), "fallback warning phrasing is kept");
  assert.ok(fast.includes("NEVER fill out"), "HITL registration rule is kept");
  assert.ok(fast.includes("Please click the link"), "HITL handoff phrase is kept");
  assert.ok(fast.toLowerCase().includes("vridhamma.org"), "trusted-domain rule is kept");
});

test("fast-path prompt: carries the bilingual language-parameter rule", () => {
  const fast = buildFastPathSystemPrompt("What is Vipassana?", "en");
  assert.ok(fast.includes('language="vi"') || fast.includes("language='vi'"));
  assert.ok(fast.includes('language="en"') || fast.includes("language='en'"));
});
