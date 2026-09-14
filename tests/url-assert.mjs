/**
 * tests/url-assert.mjs — URL-aware assertion helpers for tests.
 *
 * Why this exists: CodeQL's js/incomplete-url-substring-sanitization flags
 * `haystack.includes("some.host/...")` as an insecure URL check, even in
 * test assertions. These helpers parse URLs with the WHATWG URL API first
 * (exactly what CodeQL recommends) and compare hosts / exact URLs, so tests
 * never do raw substring checks on URL strings.
 */

const URL_TOKEN_RE = /https?:\/\/[^\s)"']+/g;

export function extractUrls(text) {
  return String(text).match(URL_TOKEN_RE) ?? [];
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when `text` contains exactly `expectedUrl` as a URL token. */
export function hasExactUrl(text, expectedUrl) {
  return extractUrls(text).some((u) => u === expectedUrl);
}

/**
 * True when any URL in `text` belongs to `host` (exact or subdomain).
 * e.g. hasHost(out, "vridhamma.org") matches schedule.vridhamma.org.
 */
export function hasHost(text, host) {
  const want = String(host).toLowerCase();
  return extractUrls(text).some((u) => {
    const h = hostnameOf(u);
    return h !== null && (h === want || h.endsWith(`.${want}`));
  });
}
