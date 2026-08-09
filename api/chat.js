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
import { KNOWLEDGE_SYSTEM_PROMPT } from "./system-prompt.js";
import { loadKnowledgeBase } from "./knowledge.js";
import { sanitize_urls } from "./sanitize.js";
import { classifyIntent } from "./router.js";
import { normalize } from "./router.js";
import { buildFastPathSystemPrompt } from "./sections.js";
import { getQuickAnswer } from "./quick-answers.js";
import { answerCache } from "./answer-cache.js";
import { getCenterInfo, getCenterInfoInputSchema } from "./tools/get-center-info.js";
import { getCourseDetails, getCourseDetailsInputSchema } from "./tools/get-course-details.js";
import { listCourses, listCoursesInputSchema } from "./tools/list-courses.js";

const MAX_MESSAGES = 20;
const MAX_REQUEST_MESSAGES = 100;
const MAX_MESSAGE_LENGTH = 20000;
const MAX_TOOL_STEPS = 5;
const LLM_TIMEOUT_MS = 50000;

const LLM_CHAT_URL = "https://opencode.ai/zen/v1/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash-free";
const DEFAULT_FAST_MODEL = "mimo-v2.5-free";

const ERROR_RESPONSE_TEXT =
  "Xin lỗi, đã có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau. / " +
  "Sorry, something went wrong while processing your request. Please try again later.";

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
  const modelId = process.env.AGENT_MODEL || DEFAULT_MODEL;

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
    const fastModelId = process.env.FAST_MODEL || DEFAULT_FAST_MODEL;

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
      const content = await callFastPath(apiMessages, apiKey, fastModelId, modelId);
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
        apiMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
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
 * Run the fast-path LLM call with the configured fast model, falling back to
 * the standard model once if the fast model request fails. Returns the
 * assistant's content string, or "" on a non-string content.
 */
async function callFastPath(apiMessages, apiKey, fastModelId, modelId) {
  let choice;
  try {
    choice = await callChatCompletion(apiMessages, apiKey, fastModelId, { tools: false });
  } catch (fastErr) {
    console.error("Fast model call failed, retrying with standard model:", fastErr);
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
