/**
 * tests/markdown.test.mjs — Unit suite for the client-side markdown renderer
 * (public/markdown.js) that powers the agent's reply bubbles.
 *
 * Security invariants under test:
 *   - Input is HTML-escaped before any markdown processing (<script> cannot
 *     become executable).
 *   - Only trusted-domain URLs (ucenlist.org / *.vridhamma.org) become <a>
 *     tags; anything else is replaced with the 🔒 removal notice.
 *   - Bare untrusted schemes can never become links.
 *
 * Run: node --test tests/
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { renderMarkdown, TRUSTED_DOMAIN_RE } from "../public/markdown.js";

// ─── Inline styles ────────────────────────────────────────────────────────────

test("inline: **bold** renders strong", () => {
  assert.equal(renderMarkdown("hello **world**"), "<p>hello <strong>world</strong></p>");
});

test("inline: *italic* renders em", () => {
  assert.equal(renderMarkdown("an *important* point"), "<p>an <em>important</em> point</p>");
});

test("inline: `code` renders code", () => {
  assert.equal(renderMarkdown("run `npm test` now"), "<p>run <code>npm test</code> now</p>");
});

test("inline: bold and code nesting does not corrupt tags", () => {
  const html = renderMarkdown("**a** `b` *c*");
  assert.match(html, /<strong>a<\/strong>/);
  assert.match(html, /<code>b<\/code>/);
  assert.match(html, /<em>c<\/em>/);
});

// ─── Block elements ───────────────────────────────────────────────────────────

test("blocks: ### heading renders h3", () => {
  assert.equal(renderMarkdown("### Title"), "<h3>Title</h3>");
});

test("blocks: #### and ##### headings render h4/h5", () => {
  assert.equal(renderMarkdown("#### Sub"), "<h4>Sub</h4>");
  assert.equal(renderMarkdown("##### Deep"), "<h5>Deep</h5>");
});

test("blocks: unordered list renders ul/li", () => {
  const html = renderMarkdown("- one\n- two\n- three");
  assert.equal(html, "<ul><li>one</li><li>two</li><li>three</li></ul>");
});

test("blocks: ordered list renders ol/li", () => {
  const html = renderMarkdown("1. first\n2. second");
  assert.equal(html, "<ol><li>first</li><li>second</li></ol>");
});

test("blocks: table renders thead/tbody", () => {
  const md =
    "| Start | Status |\n" +
    "|-------|--------|\n" +
    "| Aug 26 | Open |\n" +
    "| Sep 9 | Check |";
  const html = renderMarkdown(md);
  assert.match(html, /<table>/);
  assert.match(html, /<th>Start<\/th>/);
  assert.match(html, /<th>Status<\/th>/);
  assert.match(html, /<td>Aug 26<\/td>/);
  assert.match(html, /<td>Open<\/td>/);
});

test("blocks: table cells with **bold** are rendered inline", () => {
  const md = "| Day |\n|---|\n| **Mon** |";
  const html = renderMarkdown(md);
  assert.match(html, /<td><strong>Mon<\/strong><\/td>/);
});

test("blocks: single newline inside paragraph becomes <br>", () => {
  assert.equal(renderMarkdown("line one\nline two"), "<p>line one<br>line two</p>");
});

test("blocks: blank line separates paragraphs", () => {
  assert.equal(renderMarkdown("para one\n\npara two"), "<p>para one</p>\n<p>para two</p>");
});

test("blocks: horizontal rule renders hr", () => {
  assert.equal(renderMarkdown("a\n\n---\n\nb"), "<p>a</p>\n<hr>\n<p>b</p>");
});

// ─── Links: trusted vs untrusted ──────────────────────────────────────────────

test("links: trusted ucenlist.org link becomes an anchor", () => {
  const html = renderMarkdown("[site](https://ucenlist.org)");
  assert.match(
    html,
    /<a href="https:\/\/ucenlist\.org" target="_blank" rel="noopener noreferrer">site<\/a>/
  );
});

test("links: trusted vridhamma.org link with query becomes an anchor", () => {
  const url = "https://schedule.vridhamma.org/form/vi-application-form?centre=344&course=69263";
  const html = renderMarkdown(`[apply](${url})`);
  assert.match(html, /<a href="https:\/\/schedule\.vridhamma\.org\/form\/vi-application-form\?centre=344&amp;course=69263"/);
  assert.ok(!html.includes("link-removed"), "trusted link must not be flagged");
});

test("links: TRUSTED_DOMAIN_RE accepts ucenlist.org and *.vridhamma.org", () => {
  for (const url of [
    "https://ucenlist.org",
    "https://www.ucenlist.org/en",
    "https://schedule.vridhamma.org/vi/courses/virocana",
    "https://virocana.vridhamma.org/vi",
    "http://schedule.vridhamma.org",
  ]) {
    assert.ok(TRUSTED_DOMAIN_RE.test(url), `should accept ${url}`);
  }
});

test("links: untrusted link becomes the 🔒 removal notice", () => {
  const html = renderMarkdown("[apply](https://secure-meditation-vn.com/register)");
  assert.match(html, /class="link-removed"/);
  assert.match(html, /\[🔒 Link removed/);
  assert.doesNotMatch(html, /<a /);
});

test("links: domain-spoofing URL becomes the removal notice", () => {
  const html = renderMarkdown("[x](https://vridhamma.org.evil.com/steal)");
  assert.match(html, /class="link-removed"/);
});

test("links: bare trusted URL becomes an anchor", () => {
  const html = renderMarkdown("Visit https://ucenlist.org today");
  assert.match(html, /<a href="https:\/\/ucenlist\.org"/);
});

test("links: rendered anchor is not re-linked by the bare-URL pass", () => {
  const html = renderMarkdown("[site](https://ucenlist.org)");
  assert.equal(html.match(/<a /g).length, 1, "exactly one anchor, no nesting");
});

// ─── Safety / escaping ────────────────────────────────────────────────────────

test("safety: <script> is escaped, not executable", () => {
  const html = renderMarkdown("hi <script>alert(1)</script>");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("safety: ampersand in text is escaped", () => {
  assert.equal(renderMarkdown("M&Ms"), "<p>M&amp;Ms</p>");
});

test("safety: html in link text is escaped", () => {
  const html = renderMarkdown('[<img src=x onerror=alert(1)>](https://ucenlist.org)');
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("safety: javascript: URL never becomes an anchor", () => {
  const html = renderMarkdown("[x](javascript:alert(1))");
  assert.doesNotMatch(html, /<a /);
  assert.match(html, /class="link-removed"/);
});

test("safety: 🔒 removal notice from the server is highlighted", () => {
  const html = renderMarkdown(
    "[🔒 Link removed: only official ucenlist.org and vridhamma.org links are shared]"
  );
  assert.match(html, /class="link-removed"/);
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

test("edge: empty string renders empty", () => {
  assert.equal(renderMarkdown(""), "");
});

test("edge: null/undefined render empty", () => {
  assert.equal(renderMarkdown(null), "");
  assert.equal(renderMarkdown(undefined), "");
});

test("edge: heading without space after # is not a heading", () => {
  assert.equal(renderMarkdown("###NotATitle"), "<p>###NotATitle</p>");
});
