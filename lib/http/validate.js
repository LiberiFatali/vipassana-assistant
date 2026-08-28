export const MAX_MESSAGES = 20;
export const MAX_REQUEST_MESSAGES = 100;
export const MAX_MESSAGE_LENGTH = 20000;
export const VALID_ROLES = new Set(["user", "assistant"]);

/**
 * Validate messages array shape.
 * @param {unknown} messages
 * @returns {{ valid: boolean, error?: string, status?: number }}
 */
export function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, error: "messages must be a non-empty array", status: 400 };
  }
  if (messages.length > MAX_REQUEST_MESSAGES) {
    return { valid: false, error: `Too many messages (max ${MAX_REQUEST_MESSAGES})`, status: 413 };
  }
  if (
    messages.some(
      (m) =>
        !VALID_ROLES.has(m.role) ||
        typeof m.content !== "string" ||
        m.content.length > MAX_MESSAGE_LENGTH
    )
  ) {
    return {
      valid: false,
      error: "Invalid message: role must be 'user' or 'assistant', content must be a string within size limits",
      status: 400,
    };
  }
  return { valid: true };
}
