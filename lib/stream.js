/**
 * lib/stream.js — zero-dependency SSE framing + rolling URL sanitization.
 *
 * The agent streams answers as Server-Sent Events. Every byte emitted must pass
 * through sanitize_urls() (AGENTS.md invariant), but the model's tokens can
 * split a URL across chunk boundaries. A naive per-chunk sanitize would mangle
 * a partial URL (e.g. replace "https://evi" before "l.com" arrives), so the
 * RollingSanitizer only commits text up to the last URL-terminator character,
 * keeping any in-flight URL in a pending window until it is complete.
 *
 * Lives in lib/ (not api/) so it is never built as a serverless function —
 * see openspec/changes/streaming-response/design.md D10.
 */
import { sanitize_urls } from "./sanitize.js";

// Bound the pending (uncommitted) tail so a pathological URL cannot grow
// memory without limit. URLs longer than this are force-committed mid-URL;
// the trusted-domain gate still applies, so nothing untrusted leaks.
const MAX_PENDING = 4096;

// Characters that can never appear inside a URL (matches sanitize.js's
// URL_PATTERN character class complement) — a safe place to cut.
const URL_TERMINATOR_RE = /[\s\)\]"']/;

const encoder = new TextEncoder();

/**
 * Writes SSE frames to a writer-like sink ({ write(chunk), close() }).
 * `write` receives a Uint8Array; the caller may pass a ReadableStream
 * controller adapter or a test double.
 */
export class SSEWriter {
  constructor(writer) {
    this.writer = writer;
  }

  send(event, data) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.writer.write(encoder.encode(frame));
  }

  status(message) {
    this.send("status", { message });
  }

  delta(text) {
    this.send("delta", { text });
  }

  done(text) {
    this.send("done", { text });
  }

  error(text) {
    this.send("error", { text });
  }

  /**
   * Emit the standard SSE terminal frame then close the underlying sink.
   * The client stops at the `done`/`error` event; `[DONE]` is a harmless
   * transport-level terminator.
   */
  close() {
    try {
      this.writer.write(encoder.encode("data: [DONE]\n\n"));
    } catch {
      /* sink already closed */
    }
    try {
      this.writer.close();
    } catch {
      /* sink already closed */
    }
  }
}

/**
 * Emits only the committed (URL-safe) prefix of the generated text, sanitized.
 *
 * - `push(chunk)`: append raw text, commit everything up to the last URL
 *   terminator (or the MAX_PENDING window bound), and emit the sanitized
 *   increment since the last emission.
 * - `end()`: sanitize the entire raw buffer (flushes any trailing URL with no
 *   terminator), emit the remaining increment, and return the full sanitized
 *   text (the authoritative `done` payload).
 */
export class RollingSanitizer {
  /**
   * @param {(increment: string) => void} emit called with each sanitized increment
   */
  constructor(emit) {
    this.emit = emit;
    this.rawBuffer = "";
    this.sanitizedEmitted = "";
  }

  push(chunk) {
    this.rawBuffer += chunk;
    const committed = this.rawBuffer.slice(0, this._safeCut());
    this._advance(committed);
  }

  end() {
    this._advance(this.rawBuffer);
    return this.sanitizedEmitted;
  }

  /** Index of the last URL terminator + 1, clamped so the pending tail ≤ MAX_PENDING. */
  _safeCut() {
    let cut = 0;
    for (let i = this.rawBuffer.length - 1; i >= 0; i--) {
      if (URL_TERMINATOR_RE.test(this.rawBuffer[i])) {
        cut = i + 1;
        break;
      }
    }
    if (this.rawBuffer.length - cut > MAX_PENDING) {
      cut = this.rawBuffer.length - MAX_PENDING;
    }
    return cut;
  }

  /**
   * Sanitize `committed` (a prefix of rawBuffer that ends on a URL boundary)
   * and emit the newly-appearing suffix. Prefix stability holds because
   * committed only grows and sanitize_urls() is idempotent on already-committed
   * text, so the previously emitted sanitized text is always a prefix of the
   * new one.
   */
  _advance(committed) {
    const sanitized = sanitize_urls(committed);
    if (sanitized.length > this.sanitizedEmitted.length) {
      this.emit(sanitized.slice(this.sanitizedEmitted.length));
    }
    this.sanitizedEmitted = sanitized;
  }
}
