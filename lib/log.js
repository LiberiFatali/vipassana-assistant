/**
 * lib/log.js — zero-dependency structured JSON-line logging for Vercel
 * Runtime Logs.
 *
 * Every event is one JSON object on one line, emitted through the matching
 * console method so severity is reflected in the dashboard:
 *   info → console.log, warn → console.warn, error → console.error
 *
 * Correlation: `withLogContext` runs a function inside an AsyncLocalStorage
 * store carrying request-scoped fields (requestId, conversationId, lang);
 * `log*()` merges the current store into every line, so modules deep in the
 * call tree (llm.js, scraper, schedule-answers) emit correlated lines with no
 * signature changes.
 *
 * Privacy: full user messages and full answers are never logged. Query text is
 * represented by a truncated diacritic-stripped preview (`qPreview`) and a
 * sha256 hash (`hashQuestion`); errors are reduced by `safeErr` to a bounded
 * name+message with no stacks, API keys, or provider payloads.
 *
 * Level filtering: LOG_LEVEL env (default "info"); "warn"/"error" suppress
 * lower severities.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { stripDiacritics } from "./normalize.js";

const LEVEL_ORDER = { info: 10, warn: 20, error: 30 };
const DEFAULT_LOG_LEVEL = "info";

const _context = new AsyncLocalStorage();

function activeLevel() {
  const raw = String(process.env.LOG_LEVEL || DEFAULT_LOG_LEVEL).toLowerCase();
  return LEVEL_ORDER[raw] ?? LEVEL_ORDER[DEFAULT_LOG_LEVEL];
}

function currentContext() {
  return _context.getStore() || {};
}

/**
 * Run `fn` with request-scoped log context (e.g. { requestId,
 * conversationId, lang }). All log* calls inside — including awaited work —
 * automatically carry these fields.
 */
export function withLogContext(ctx, fn) {
  return _context.run({ ...currentContext(), ...ctx }, fn);
}

function emit(level, event, fields) {
  if (LEVEL_ORDER[level] < activeLevel()) {
    return;
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...currentContext(),
    ...fields,
  });
  const sink =
    level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(line);
}

export function logInfo(event, fields = {}) {
  emit("info", event, fields);
}

export function logWarn(event, fields = {}) {
  emit("warn", event, fields);
}

export function logError(event, fields = {}) {
  emit("error", event, fields);
}

/**
 * Reduce an error to a bounded, greppable shape: { name, message } with the
 * message truncated to 300 chars. Never includes stacks, keys, or payloads.
 * Returns null for a falsy error.
 */
export function safeErr(err) {
  if (!err) {
    return null;
  }
  return {
    name: err.name || "Error",
    message: String(err.message || String(err)).slice(0, 300),
  };
}

/**
 * 16-hex-char sha256 digest of the normalized question — correlates repeated
 * or failing queries without storing readable text.
 */
export function hashQuestion(text) {
  const n = stripDiacritics(String(text || "")).toLowerCase();
  return createHash("sha256").update(n).digest("hex").slice(0, 16);
}

/**
 * Diacritic-stripped, truncated preview of the latest user message (80 chars)
 * for readable debugging.
 */
export function qPreview(text) {
  return stripDiacritics(String(text || "")).slice(0, 80);
}
