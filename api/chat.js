/**
 * POST /api/chat — the single agent endpoint.
 *
 * Stateless: the client supplies the full message history; the server prepends
 * the system prompt (base template + injected SKILL.md), runs a manual tool
 * loop against the OpenCode Zen chat-completions endpoint (up to 5 steps),
 * sanitizes the final text with sanitize_urls(), and returns { text }.
 *
 * Direct fetch on purpose: the Zen endpoint is plain OpenAI-compatible and the
 * previous AI SDK layer (ai + @ai-sdk/openai-compatible) added ~12MB of deps
 * and an SDK-version churn bug in the auto tool loop. Non-streaming by design
 * so URL sanitization happens at the single trustworthy point on the complete
 * final text.
 */
import { KNOWLEDGE_SYSTEM_PROMPT } from "../lib/system-prompt.js";
import { loadKnowledgeBase } from "../lib/knowledge.js";
import { sanitize_urls } from "../lib/sanitize.js";
import { classifyIntent } from "../lib/router.js";
import { normalize } from "../lib/router.js";
import { buildFastPathSystemPrompt } from "../lib/sections.js";
import { getQuickAnswer } from "../lib/quick-answers.js";
import { getScheduleAnswer } from "../lib/schedule-answers.js";
import { answerCache } from "../lib/answer-cache.js";
import { getCenterInfo, getCenterInfoInputSchema } from "../lib/tools/get-center-info.js";
import { getCourseDetails, getCourseDetailsInputSchema } from "../lib/tools/get-course-details.js";
import { listCourses, listCoursesInputSchema } from "../lib/tools/list-courses.js";
import { RollingSanitizer, SSEWriter } from "../lib/stream.js";

const MAX_MESSAGES = 20;
const MAX_REQUEST_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 20000;
const MAX_TOOL_STEPS = 5;
const LLM_TIMEOUT_MS = 50000;
const FIRST_TOKEN_TIMEOUT_MS = 10000;
const TOOL_RESULT_ECHO_MAX = 8192;

const LLM_CHAT_URL = "https://opencode.ai/zen/v1/chat/completions";
// Single model id used for the classifier, the knowledge fast path, the tool
// loop, and every retry. `AGENT_MODEL` wins if set; `FAST_MODEL` is the
// fallback override; otherwise the lightweight default. `deepseek-v4-flash-free`
// was chosen over `mimo-v2.5-free` because the latter now behaves as a slow
// reasoning model (~30s to first content token, tripping the first-token
// watchdog); deepseek reaches first content in ~5s.
const DEFAULT_MODEL = "deepseek-v4-flash-free";

/** Resolve the single model id from env (AGENT_MODEL > FAST_MODEL > default). */
function resolveModel() {
  return process.env.AGENT_MODEL || process.env.FAST_MODEL || DEFAULT_MODEL;
}

const ERROR_RESPONSE_TEXT =
  "Xin lỗi, đã có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau. / " +
  "Sorry, something went wrong while processing your request. Please try again later.";

/** True when a streamed LLM call was aborted by the first-token/overall timer. */
function isTimeoutError(err) {
  return Boolean(err) && (err.name === "AbortError" || err.name === "TimeoutError");
}

/**
 * Tool registry: plain OpenAI function schemas plus the zod parse/execute
 * functions (zod keeps the input coercion/defaults from the tool modules).
 */
const TOOLS = [
  {
    name: "list_courses",
    description:
      "Returns upcoming Vipassana meditation courses at UCENLIST centers (Dhamma Virocana / Hà Nội and Dhamma Vutthi / TP. HCM). Use for course schedules, dates, open/full status, and registration links.",
    parameters: {
      type: "object",
      properties: {
        center: {
          type: "string",
          enum: ["virocana", "vutthi", "all"],
          default: "all",
          description:
            "Which center to query: 'virocana' (Ha Noi / Hà Nội), 'vutthi' (Ho Chi Minh City / TP. HCM), or 'all' for both.",
        },
        language: {
          type: "string",
          enum: ["vi", "en"],
          default: "vi",
          description: "Language for schedule page: 'vi' for Vietnamese, 'en' for English.",
        },
        course_type: {
          type: "string",
          description:
            "Optional filter by course type, e.g. '10-day', 'short', 'satipatthana'. Leave empty for all types.",
        },
      },
      additionalProperties: false,
    },
    parse: listCoursesInputSchema.parse,
    execute: listCourses,
  },
  {
    name: "get_course_details",
    description:
      "Fetches supplementary information (eligibility, comments, registration notes, special instructions) for a specific course from its VRI apply_url. Use the apply_url returned by list_courses.",
    parameters: {
      type: "object",
      properties: {
        apply_url: {
          type: "string",
          description: "The apply_url from a list_courses result. Must be a schedule.vridhamma.org URL.",
        },
      },
      required: ["apply_url"],
      additionalProperties: false,
    },
    parse: getCourseDetailsInputSchema.parse,
    execute: getCourseDetails,
  },
  {
    name: "get_center_info",
    description:
      "Returns static contact and location information (address, phone, email, website, schedule links) for a UCENLIST meditation center.",
    parameters: {
      type: "object",
      properties: {
        center: {
          type: "string",
          description:
            "Which center to get info for: 'virocana' = Dhamma Virocana in Ha Noi (Hà Nội), 'vutthi' = Dhamma Vutthi in Ho Chi Minh City (TP. Hồ Chí Minh).",
        },
      },
      required: ["center"],
      additionalProperties: false,
    },
    parse: getCenterInfoInputSchema.parse,
    execute: getCenterInfo,
  },
];

export const config = {
  maxDuration: 60,
};

export async function POST(request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 1024 * 1024) {
    return Response.json({ error: "Request body too large" }, { status: 413 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = body && body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages must be a non-empty array" }, { status: 400 });
  }
  if (messages.length > MAX_REQUEST_MESSAGES) {
    return Response.json(
      { error: `Too many messages (max ${MAX_REQUEST_MESSAGES})` },
      { status: 413 }
    );
  }
  if (messages.some((m) => typeof m.content !== "string" || m.content.length > MAX_MESSAGE_LENGTH)) {
    return Response.json({ error: "Invalid or oversized message content" }, { status: 400 });
  }

  const trimmed = messages.slice(-MAX_MESSAGES).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  // Streaming negotiation: opt-in via `Accept: text/event-stream` or `?stream=1`.
  const wantsStream =
    (request.headers.get("accept") || "").includes("text/event-stream") ||
    new URL(request.url).searchParams.get("stream") === "1";

  if (wantsStream) {
    return new Response(generateAgentStream(trimmed), {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const text = await generateAgentResponse(trimmed);
  return Response.json({ text });
}

/**
 * Run the tool loop against the OpenCode Zen chat-completions endpoint and
 * return a sanitized final response. Never leaks provider keys or untrusted
 * URLs in error output.
 *
 * Knowledge-base-only questions take a fast path: a single LLM call with a
 * trimmed prompt and no tools attached. Everything else keeps the full tool
 * loop with the complete knowledge base.
 */
async function generateAgentResponse(messages) {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) {
    console.error("OPENCODE_API_KEY is not set");
    return sanitize_urls(ERROR_RESPONSE_TEXT);
  }
  const modelId = resolveModel();

  // Decide the response path from the latest user message.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUser ? lastUser.content : "";

  let route;
  try {
    route = await classifyIntent(userText, apiKey, modelId);
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
      const content = await callFastPath(apiMessages, apiKey, modelId);
      if (content) {
        answerCache.set(cacheKey, content);
      }
      return sanitize_urls(content || ERROR_RESPONSE_TEXT);
    } catch (err) {
      console.error("Fast-path LLM call failed:", err);
      return sanitize_urls(ERROR_RESPONSE_TEXT);
    }
  }

  // Tool path: full knowledge base + full tool registry.
  const system = KNOWLEDGE_SYSTEM_PROMPT.replace("{knowledge_base}", loadKnowledgeBase());

  // Deterministic schedule fast path: windowed schedule/date queries are
  // answered from scraped/cached course data with no LLM call and no tools.
  // Any non-match (or failure) returns null and falls through to the tool loop.
  const schedule = await getScheduleAnswer(userText, route.lang);
  if (schedule !== null) {
    return sanitize_urls(schedule);
  }

  const apiMessages = [{ role: "system", content: system }, ...messages];

  try {
    let lastText = "";

    for (let step = 0; step < MAX_TOOL_STEPS; step++) {
      const choice = await callChatCompletion(apiMessages, apiKey, modelId);
      const message = choice.message || {};
      if (typeof message.content === "string" && message.content) {
        lastText = message.content;
      }

      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (toolCalls.length === 0) {
        return sanitize_urls(lastText);
      }

      // Echo the assistant tool-call message back (drop reasoning_content —
      // it is not a valid chat-completions request field).
      apiMessages.push({
        role: "assistant",
        content: message.content || "",
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      });

      for (const tc of toolCalls) {
        const result = await executeToolCall(tc);
        apiMessages.push({ role: "tool", tool_call_id: tc.id, content: truncateToolResult(result) });
      }
    }

    // Step cap reached without a plain-text finish.
    return sanitize_urls(lastText || ERROR_RESPONSE_TEXT);
  } catch (err) {
    // Safe error path: a static bilingual message, never an untrusted URL.
    console.error("LLM call failed:", err);
    return sanitize_urls(ERROR_RESPONSE_TEXT);
  }
}

/**
 * Streaming response path. Returns a web ReadableStream that emits SSE frames:
 * `status` (tool-loop progress), `delta` (sanitized text increments), `done`
 * (complete sanitized answer — always the success terminator) or `error`
 * (static bilingual message on mid-stream failure). Every emitted byte passes
 * through the rolling sanitizer, preserving the trusted-domain invariant.
 */
function generateAgentStream(messages) {
  return new ReadableStream({
    start(controller) {
      const sse = new SSEWriter({
        write: (chunk) => controller.enqueue(chunk),
        close: () => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        },
      });
      runStream(sse, messages).catch((err) => {
        console.error("Stream failed:", err);
        try {
          sse.error(ERROR_RESPONSE_TEXT);
        } catch {
          /* sink closed */
        }
        try {
          sse.close();
        } catch {
          /* sink closed */
        }
      });
    },
  });
}

async function runStream(sse, messages) {
  try {
    const apiKey = process.env.OPENCODE_API_KEY;
    if (!apiKey) {
      console.error("OPENCODE_API_KEY is not set");
      sse.done(sanitize_urls(ERROR_RESPONSE_TEXT));
      return;
    }
    const modelId = resolveModel();

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const userText = lastUser ? lastUser.content : "";

    let route;
    try {
      route = await classifyIntent(userText, apiKey, modelId);
    } catch (err) {
      console.error("Intent routing failed, defaulting to tool path:", err);
      route = { kind: "tools" };
    }

    if (route.kind === "kb") {
      await streamFastPath(sse, messages, route.lang, apiKey, modelId);
    } else {
      // Deterministic schedule fast path short-circuits before the tool loop.
      const schedule = await getScheduleAnswer(userText, route.lang);
      if (schedule !== null) {
        sse.done(sanitize_urls(schedule));
        return;
      }
      await streamToolPath(sse, messages, apiKey, modelId);
    }
  } finally {
    try {
      sse.close();
    } catch {
      /* sink closed */
    }
  }
}

/**
 * KB fast path, streamed. Order matches the non-streaming path:
 * 1) deterministic quick-answer -> `done` immediately (no LLM, no tools);
 * 2) answer-cache hit -> `done` immediately;
 * 3) stream the FAST_MODEL call (no tools, trimmed prompt) with one retry to
 *    AGENT_MODEL before the first delta is emitted; a mid-stream failure emits
 *    the static `error` event. The complete answer is cached after streaming.
 */
async function streamFastPath(sse, messages, lang, apiKey, modelId) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = lastUser ? lastUser.content : "";

  const quick = getQuickAnswer(userText, lang);
  if (quick !== null) {
    sse.done(sanitize_urls(quick));
    return;
  }

  const cacheKey = `${lang}|${normalize(userText)}`;
  const cached = answerCache.get(cacheKey);
  if (cached !== null) {
    sse.done(sanitize_urls(cached));
    return;
  }

  const system = buildFastPathSystemPrompt(userText, lang);
  const apiMessages = [{ role: "system", content: system }, ...messages];

  let roller = new RollingSanitizer((inc) => sse.delta(inc));
  let full = "";
  try {
    for await (const piece of streamChatCompletion(apiMessages, apiKey, modelId, { tools: false })) {
      if (piece.delta && typeof piece.delta.content === "string" && piece.delta.content) {
        full += piece.delta.content;
        roller.push(piece.delta.content);
      }
    }
  } catch (fastErr) {
    if (full || isTimeoutError(fastErr)) {
      // Output already produced, or the model stalled with no output (first-token
      // watchdog or overall timeout) — retrying would double the wait (and exceed
      // Vercel maxDuration), so fail fast.
      if (full) {
        console.error("Fast model stream failed after producing output:", fastErr);
      } else {
        console.error("Fast model stream timed out with no output:", fastErr);
      }
      sse.error(ERROR_RESPONSE_TEXT);
      return;
    }
    console.error("Fast model stream failed, retrying once:", fastErr);
    roller = new RollingSanitizer((inc) => sse.delta(inc));
    try {
      for await (const piece of streamChatCompletion(apiMessages, apiKey, modelId, { tools: false })) {
        if (piece.delta && typeof piece.delta.content === "string" && piece.delta.content) {
          full += piece.delta.content;
          roller.push(piece.delta.content);
        }
      }
    } catch (err) {
      console.error("Fast-path stream retry also failed:", err);
      sse.error(ERROR_RESPONSE_TEXT);
      return;
    }
  }

  if (full) {
    answerCache.set(cacheKey, full);
  }
  sse.done(roller.end());
}

// Bilingual status messages shown while the tool loop runs.
const TOOL_STATUS = {
  list_courses: "Đang tra cứu lịch khóa thiền… / Looking up course schedules…",
  get_course_details: "Đang tìm thông tin khóa thiền… / Fetching course details…",
  get_center_info: "Đang lấy thông tin trung tâm… / Getting center info…",
};
const STATUS_TOOL_GENERIC = "Đang tìm kiếm thông tin… / Looking things up…";
const STATUS_TOOL_DONE = "Đang tổng hợp câu trả lời… / Compiling the answer…";

/**
 * Tool path, streamed. Runs the tool loop with streaming LLM calls; emits a
 * `status` event before/after tool execution and streams the final
 * text-generating call as `delta` events. Keeps the full knowledge base and
 * full tool registry. On step cap or mid-stream failure emits `error`.
 *
 * Each step is classified AFTER its stream ends (never from the first delta):
 * content is buffered and tool_calls are accumulated for the whole step, then
 * the step is a tool step (any complete tool call), a final text step (content
 * and no tool calls), or degenerate (neither) which emits `error`. A step
 * failure retries once before any output is emitted; once content or tool-call
 * fragments have accumulated, a failure emits `error` instead of retrying.
 */
async function streamToolPath(sse, messages, apiKey, modelId) {
  const system = KNOWLEDGE_SYSTEM_PROMPT.replace("{knowledge_base}", loadKnowledgeBase());
  const apiMessages = [{ role: "system", content: system }, ...messages];

  for (let step = 0; step < MAX_TOOL_STEPS; step++) {
    let stepContent = "";
    const toolCallAcc = [];

    const runStep = async (useModel) => {
      stepContent = "";
      toolCallAcc.length = 0;
      try {
        for await (const piece of streamChatCompletion(apiMessages, apiKey, useModel)) {
          const delta = piece.delta || {};
          if (typeof delta.content === "string" && delta.content) {
            stepContent += delta.content;
          }
          accumulateToolCalls(toolCallAcc, delta.tool_calls);
        }
      } catch (err) {
        // Tag the error with how much of the step had already been produced so
        // the caller can decide whether a retry is safe.
        if (err && typeof err === "object") {
          err.partial = { content: stepContent, fragments: toolCallAcc.length > 0 };
        }
        throw err;
      }
    };

    try {
      await runStep(modelId);
    } catch (err) {
      if (err.partial && (err.partial.content || err.partial.fragments)) {
        // Output was already produced by this step — too late to retry.
        console.error("Tool-path stream step failed after producing output:", err);
        sse.error(ERROR_RESPONSE_TEXT);
        return;
      }
      if (isTimeoutError(err)) {
        // A 50s timeout with no output is a slow/stalled provider — retrying
        // the same model immediately just doubles the user's wait. Fail fast.
        console.error("Tool-path stream step timed out with no output:", err);
        sse.error(ERROR_RESPONSE_TEXT);
        return;
      }
      console.error("Tool-path stream step failed, retrying once:", err);
      try {
        await runStep(modelId);
      } catch (retryErr) {
        console.error("Tool-path stream step retry also failed:", retryErr);
        sse.error(ERROR_RESPONSE_TEXT);
        return;
      }
    }

    const toolCalls = toolCallAcc
      .filter((tc) => tc && tc.name)
      .map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));

    if (toolCalls.length === 0 && stepContent) {
      // Final text-generating step: flush the buffered text and emit done.
      const roller = new RollingSanitizer((inc) => sse.delta(inc));
      roller.push(stepContent);
      sse.done(roller.end());
      return;
    }
    if (toolCalls.length === 0) {
      // Degenerate response (no text, no tool calls): stop with a static error.
      sse.error(ERROR_RESPONSE_TEXT);
      return;
    }

    // Echo the assistant tool-call message back and execute the calls.
    apiMessages.push({ role: "assistant", content: stepContent || "", tool_calls: toolCalls });
    for (const tc of toolCalls) {
      sse.status(TOOL_STATUS[tc.function.name] || STATUS_TOOL_GENERIC);
      const result = await executeToolCall(tc);
      apiMessages.push({ role: "tool", tool_call_id: tc.id, content: truncateToolResult(result) });
      sse.status(STATUS_TOOL_DONE);
    }
  }

  // Step cap reached without a plain-text finish.
  sse.error(ERROR_RESPONSE_TEXT);
}

/**
 * Bound the size of a tool result echoed back into the conversation. The full
 * result is what the tool returned; only the echo into `apiMessages` is
 * truncated so an oversized `list_courses` payload cannot balloon the next
 * prompt. A marker tells the model the data is incomplete.
 */
function truncateToolResult(result) {
  if (typeof result !== "string" || result.length <= TOOL_RESULT_ECHO_MAX) {
    return result;
  }
  return result.slice(0, TOOL_RESULT_ECHO_MAX) + "\n…[truncated]";
}

/**
 * Accumulate OpenAI-style streamed `tool_calls` delta fragments (keyed by
 * `index`) into complete calls. Each fragment carries the `id`/`name` on its
 * first occurrence and the JSON `arguments` string may be split across chunks.
 */
function accumulateToolCalls(acc, deltas) {
  if (!Array.isArray(deltas)) return;
  for (const frag of deltas) {
    const index = frag.index || 0;
    if (!acc[index]) acc[index] = { id: "", name: "", arguments: "" };
    if (frag.id) acc[index].id = frag.id;
    if (frag.function) {
      if (frag.function.name) acc[index].name = frag.function.name;
      if (typeof frag.function.arguments === "string" && frag.function.arguments) {
        acc[index].arguments += frag.function.arguments;
      }
    }
  }
}

/**
 * Run the fast-path LLM call with the configured model, retrying once if the
 * request fails before producing output. Returns the assistant's content
 * string, or "" on a non-string content.
 */
async function callFastPath(apiMessages, apiKey, modelId) {
  let choice;
  try {
    choice = await callChatCompletion(apiMessages, apiKey, modelId, { tools: false });
  } catch (fastErr) {
    if (isTimeoutError(fastErr)) {
      // A 50s timeout with no output is a stalled provider — fail fast rather
      // than making the caller wait through another 50s retry.
      console.error("Fast model call timed out with no output:", fastErr);
      throw fastErr;
    }
    console.error("Fast model call failed, retrying once:", fastErr);
    choice = await callChatCompletion(apiMessages, apiKey, modelId, { tools: false });
  }
  return choice.message && typeof choice.message.content === "string"
    ? choice.message.content
    : "";
}

/**
 * POST a chat-completions request. Throws on transport or non-2xx errors.
 * Options: { tools: boolean } — pass tools: false to omit tool definitions
 * entirely (fast path), which prevents any tool call on that request.
 */async function callChatCompletion(apiMessages, apiKey, modelId, options = {}) {
  const useTools = options.tools !== false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  const payload = {
    model: modelId,
    messages: apiMessages,
  };
  if (useTools) {
    payload.tools = TOOLS.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    payload.tool_choice = "auto";
  }

  let res;
  try {
    res = await fetch(LLM_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`LLM API returned non-JSON (status ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(`LLM API error ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }

  const choice = data.choices && data.choices[0];
  if (!choice || !choice.message) {
    throw new Error("LLM API returned no choices");
  }
  return choice;
}

/**
 * POST a streaming chat-completions request and yield provider SSE deltas.
 * Yields `{ delta, finishReason }` for each content/tool-call piece. Throws on
 * transport errors, non-2xx responses, or a stream read failure so callers can
 * fall back before the first delta is emitted. One abort timer is armed at
 * `firstTokenTimeoutMs` (default ~10s) and re-armed at `LLM_TIMEOUT_MS` once
 * the first content/tool-call delta arrives, so a stalled model fails fast
 * while a mid-stream hang still cannot run forever.
 */
async function* streamChatCompletion(apiMessages, apiKey, modelId, options = {}) {
  const useTools = options.tools !== false;
  const firstTokenTimeoutMs =
    options.firstTokenTimeoutMs ?? (Number(process.env.FIRST_TOKEN_TIMEOUT_MS) || FIRST_TOKEN_TIMEOUT_MS);
  const controller = new AbortController();

  let firstDeltaSeen = false;
  const armTimer = () =>
    setTimeout(() => controller.abort(), firstDeltaSeen ? LLM_TIMEOUT_MS : firstTokenTimeoutMs);
  let timer = armTimer();

  const payload = { model: modelId, messages: apiMessages, stream: true };
  if (useTools) {
    payload.tools = TOOLS.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    payload.tool_choice = "auto";
  }

  let res;
  try {
    res = await fetch(LLM_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    let detail = `LLM API error ${res.status}`;
    try {
      const data = await res.json();
      detail += `: ${JSON.stringify(data).slice(0, 300)}`;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  function* framesOf(frame) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const dataStr = line.slice(5).trim();
      if (!dataStr || dataStr === "[DONE]") continue;
      let chunk;
      try {
        chunk = JSON.parse(dataStr);
      } catch {
        continue;
      }
      const choice = chunk.choices && chunk.choices[0];
      if (choice && choice.delta) {
        // Any delta proves the stream is alive: content, tool-call fragments,
        // or reasoning tokens. Reasoning models emit `reasoning`/
        // `reasoning_content` before any content, so counting them as liveness
        // prevents a slow-to-content (but working) model from being falsely
        // aborted by the first-token watchdog.
        if (
          !firstDeltaSeen &&
          (choice.delta.content ||
            choice.delta.tool_calls ||
            choice.delta.reasoning ||
            choice.delta.reasoning_content)
        ) {
          firstDeltaSeen = true;
          clearTimeout(timer);
          timer = armTimer();
        }
        yield { delta: choice.delta, finishReason: choice.finish_reason };
      }
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        yield* framesOf(frame);
      }
    }
    buf += decoder.decode();
    if (buf) yield* framesOf(buf);
  } finally {
    clearTimeout(timer);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

/**
 * Execute a single tool call and serialize its result as the tool message
 * content. Errors are returned to the model as JSON so it can adapt instead of
 * aborting the whole response.
 */
async function executeToolCall(toolCall) {
  const fn = toolCall && toolCall.function;
  const name = fn && fn.name;
  const toolDef = TOOLS.find((t) => t.name === name);
  if (!toolDef) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  let args;
  try {
    args = JSON.parse(fn.arguments || "{}");
  } catch {
    return JSON.stringify({ error: `Invalid tool arguments JSON: ${fn.arguments}` });
  }

  try {
    const result = await toolDef.execute(toolDef.parse(args));
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: err && err.message ? err.message : String(err) });
  }
}
