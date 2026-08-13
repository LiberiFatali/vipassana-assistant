/**
 * POST /api/chat — the single agent endpoint.
 *
 * Stateless: the client supplies the full message history; the server prepends
 * the system prompt (base template + injected SKILL.md), classifies the intent
 * (knowledge-only fast path vs live-data composer via lib/llm.js — Gemini),
 * sanitizes the final text with sanitize_urls(), and returns { text }.
 *
 * Direct fetch on purpose: the Gemini endpoint is plain OpenAI-compatible and
 * the previous AI SDK layer (ai + @ai-sdk/openai-compatible) added ~12MB of
 * deps and an SDK-version churn bug in the auto tool loop. Standard
 * non-streaming response model where URL sanitization happens at a single
 * trustworthy point on the complete final text.
 */
import { chatCompletion, hasProviderKey, warnApiKeyMissing } from "../lib/llm.js";
import { KNOWLEDGE_SYSTEM_PROMPT } from "../lib/system-prompt.js";
import { loadKnowledgeBase } from "../lib/knowledge.js";
import { sanitize_urls } from "../lib/sanitize.js";
import { classifyIntent } from "../lib/router.js";
import { detectLanguage, normalize } from "../lib/router.js";
import { buildFastPathSystemPrompt } from "../lib/sections.js";
import { getQuickAnswer } from "../lib/quick-answers.js";
import { getOutOfScopeAnswer } from "../lib/out-of-scope.js";
import { buildLiveScheduleContext, getScheduleAnswer } from "../lib/schedule-answers.js";
import { answerCache } from "../lib/answer-cache.js";

const MAX_MESSAGES = 20;
const MAX_REQUEST_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 20000;
// Total wall-clock budget for every LLM call (attempt + backoff). Matches
// Vercel's `maxDuration: 60` so a request can never outlive its function
// budget. Provider selection, keys, and model resolution live in lib/llm.js
// (single Gemini provider).
const LLM_TIMEOUT_MS = 60000;

// ─── CORS ────────────────────────────────────────────────────────────────────

// Requests from the same deployment (null origin from file://, or the Vercel
// domain) are always permitted. Origins not on this list receive a 403.
// Adjust ALLOWED_ORIGINS to match your production domain(s).
const ALLOWED_ORIGINS = [
  // Allow same-origin (browser omits Origin on same-origin requests in some
  // cases, so we also allow absent Origin in addCorsHeaders below).
  // Pattern-match: any *.vercel.app subdomain + any custom domains you add.
];

const VERCEL_ORIGIN_RE = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/i;

function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin (no Origin header) or server-to-server
  if (VERCEL_ORIGIN_RE.test(origin)) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow localhost in development
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return true;
  return false;
}

function addCorsHeaders(headers, origin) {
  const allowedOrigin = isAllowedOrigin(origin) ? (origin || "*") : null;
  if (allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
    headers["Vary"] = "Origin";
  }
  return headers;
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

// Simple in-process sliding-window rate limiter. Resets on cold start.
// Vercel may run multiple warm instances, so this is a per-instance guard
// rather than a global quota, but it still stops single-client floods.
const RATE_LIMIT_MAX = 20; // requests per window
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

const _rateLimitStore = new Map(); // ip → [timestamp, ...]

function checkRateLimit(ip) {
  // Only rate-limit when a real client IP is identifiable. In Vercel production
  // `x-forwarded-for` is always injected by the edge; "unknown" means the
  // request arrived without any proxy header (local dev, internal calls, tests).
  if (!ip || ip === "unknown") return false;
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (_rateLimitStore.get(ip) || []).filter((t) => t > cutoff);
  if (timestamps.length >= RATE_LIMIT_MAX) {
    _rateLimitStore.set(ip, timestamps);
    return true; // rate-limited
  }
  timestamps.push(now);
  _rateLimitStore.set(ip, timestamps);
  // Evict very old entries to prevent unbounded growth
  if (_rateLimitStore.size > 5000) {
    const oldCutoff = now - RATE_LIMIT_WINDOW_MS * 2;
    for (const [k, ts] of _rateLimitStore) {
      if (ts[ts.length - 1] < oldCutoff) _rateLimitStore.delete(k);
    }
  }
  return false;
}

const ERROR_RESPONSE_TEXT =
  "Xin lỗi, đã có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau. / " +
  "Sorry, something went wrong while processing your request. Please try again later.";

/**
 * Friendly apology emitted when the LLM takes too long to respond.
 * Distinct from the generic error so users understand it's a temporary
 * slowness, not a permanent failure.
 */
const TIMEOUT_RESPONSE_TEXT =
  "Xin lỗi, trợ lý đang bận và mất quá nhiều thời gian để phản hồi. Bạn vui lòng thử lại sau nhé! 🙏 / " +
  "Sorry, the assistant is taking too long to respond right now. Please try again in a moment! 🙏";

/** True when a streamed LLM call was aborted by the first-token/overall timer. */
function isTimeoutError(err) {
  return Boolean(err) && (err.name === "AbortError" || err.name === "TimeoutError");
}

export const config = {
  maxDuration: 60,
};

export async function POST(request) {
  const origin = request.headers.get("origin");
  const corsHeaders = addCorsHeaders({}, origin);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  // CORS origin check
  if (!isAllowedOrigin(origin)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (checkRateLimit(ip)) {
    return Response.json(
      { error: "Too many requests. Please wait a moment before sending another message." },
      { status: 429, headers: { ...corsHeaders, "Retry-After": "60" } }
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 1024 * 1024) {
    return Response.json({ error: "Request body too large" }, { status: 413, headers: corsHeaders });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers: corsHeaders });
  }

  const messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages must be a non-empty array" }, { status: 400, headers: corsHeaders });
  }
  if (messages.length > MAX_REQUEST_MESSAGES) {
    return Response.json(
      { error: `Too many messages (max ${MAX_REQUEST_MESSAGES})` },
      { status: 413, headers: corsHeaders }
    );
  }

  // Strict role + content validation. Reject any role that is not user or
  // assistant — an invalid role could craft a misleading turn sequence.
  const VALID_ROLES = new Set(["user", "assistant"]);
  if (
    messages.some(
      (m) =>
        !VALID_ROLES.has(m.role) ||
        typeof m.content !== "string" ||
        m.content.length > MAX_MESSAGE_LENGTH
    )
  ) {
    return Response.json(
      { error: "Invalid message: role must be 'user' or 'assistant', content must be a string within size limits" },
      { status: 400, headers: corsHeaders }
    );
  }

  const trimmed = messages.slice(-MAX_MESSAGES).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  const text = await generateAgentResponse(trimmed);
  return Response.json({ text }, { headers: corsHeaders });
}

/**
 * Run the agent response path against the Gemini chat-completions endpoint and
 * return a sanitized final response. Never leaks provider keys or untrusted
 * URLs in error output.
 *
 * Knowledge-base-only questions take a fast path: a single LLM call with a
 * trimmed prompt and no tools attached. Everything else keeps the full tool
 * loop with the complete knowledge base.
 */
async function generateAgentResponse(messages) {
  if (!hasProviderKey()) {
    warnApiKeyMissing();
    return sanitize_urls(ERROR_RESPONSE_TEXT);
  }

  // Decide the response path from the latest user message.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUser ? lastUser.content : "";

  // Out-of-scope gate: deterministic fallback, no LLM call, before routing so
  // it overrides both the KB fast path and the tool path.
  const outOfScope = getOutOfScopeAnswer(userText, detectLanguage(userText));
  if (outOfScope !== null) {
    return sanitize_urls(outOfScope);
  }

  let route;
  try {
    route = await classifyIntent(userText);
  } catch (err) {
    console.error("Intent routing failed, defaulting to tool path:", err);
    route = { kind: "tools" };
  }

  if (route.kind === "kb") {
    // 1) Deterministic structured answers — no LLM call at all.
    const quick = getQuickAnswer(userText, route.lang);
    if (quick !== null) {
      return sanitize_urls(quick);
    }

    // 2) In-memory answer cache for repeated questions.
    const cacheKey = `${route.lang}|${normalize(userText)}`;
    const cached = answerCache.get(cacheKey);
    if (cached !== null) {
      return sanitize_urls(cached);
    }

    // 3) Fast path: one call, trimmed knowledge context, no tools attached.
    const system = buildFastPathSystemPrompt(userText, route.lang);
    const apiMessages = [{ role: "system", content: system }, ...messages];
    try {
      const content = await callFastPath(apiMessages);
      if (content) {
        answerCache.set(cacheKey, content);
      }
      return sanitize_urls(content || ERROR_RESPONSE_TEXT);
    } catch (err) {
      console.error("Fast-path LLM call failed:", err);
      return sanitize_urls(isTimeoutError(err) ? TIMEOUT_RESPONSE_TEXT : ERROR_RESPONSE_TEXT);
    }
  }

  // Live-data path (Pure Composer mode): pre-fetch schedule context server-side and call LLM once.
  const schedule = await getScheduleAnswer(userText, route.lang);
  if (schedule !== null) {
    return sanitize_urls(schedule);
  }

  // KB fallback: if the question has a deterministic quick-answer (e.g. center
  // address/info detected via BM25) return it immediately — prevents empty
  // answers when the router misclassifies a center-info question as tools.
  const quickFallback = getQuickAnswer(userText, route.lang);
  if (quickFallback !== null) {
    return sanitize_urls(quickFallback);
  }

  const liveContext = await buildLiveScheduleContext(userText, route.lang);
  const baseSystem = KNOWLEDGE_SYSTEM_PROMPT.replace("{knowledge_base}", loadKnowledgeBase());
  const system = `${baseSystem}\n\n${liveContext}`;
  const apiMessages = [{ role: "system", content: system }, ...messages];

  try {
    const data = await chatCompletion(apiMessages, { timeoutMs: LLM_TIMEOUT_MS });
    const choice = data.choices && data.choices[0];
    const content = (choice && choice.message && typeof choice.message.content === "string") ? choice.message.content : "";
    return sanitize_urls(content || ERROR_RESPONSE_TEXT);
  } catch (err) {
    console.error("LLM composer call failed:", err);
    return sanitize_urls(isTimeoutError(err) ? TIMEOUT_RESPONSE_TEXT : ERROR_RESPONSE_TEXT);
  }
}

/**
 * Run the fast-path LLM call (no tools attached), retrying once if the request
 * fails before producing output. Returns the assistant's content string, or ""
 * on a non-string content.
 */
async function callFastPath(apiMessages) {
  let choice;
  try {
    const data = await chatCompletion(apiMessages, { timeoutMs: LLM_TIMEOUT_MS });
    choice = data.choices && data.choices[0];
  } catch (fastErr) {
    if (isTimeoutError(fastErr)) {
      // A timeout with no output is a stalled provider — fail fast rather
      // than making the caller wait through another timeout-budget retry.
      console.error("Fast model call timed out with no output:", fastErr);
      throw fastErr;
    }
    console.error("Fast model call failed, retrying once:", fastErr);
    const retry = await chatCompletion(apiMessages, { timeoutMs: LLM_TIMEOUT_MS });
    choice = retry.choices && retry.choices[0];
  }
  return choice && choice.message && typeof choice.message.content === "string"
    ? choice.message.content
    : "";
}
