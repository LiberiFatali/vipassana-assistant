/**
 * Minimal, dependency-free markdown renderer for the agent's replies.
 *
 * Security-first design (mirrors the server-side sanitize_urls() contract):
 *   1. Input is HTML-escaped BEFORE any markdown processing, so `<script>`,
 *      `&lt;`, `onclick=`, etc. can never become executable HTML.
 *   2. Only links whose href matches the trusted-domain gate are emitted as
 *      <a> tags; everything else becomes a 🔒 removal notice. `javascript:` or
 *      any other non-http(s) scheme can never become a link.
 *   3. No DOM access — pure string function, unit-testable in Node.
 *
 * Supported syntax: ###/####/##### headings, paragraphs (single newlines
 * become <br>), | tables |, - unordered and 1. ordered lists, > blockquotes,
 * --- horizontal rules, **bold**, *italic*, `code`, [text](url), and bare
 * trusted https? URLs.
 */

export const TRUSTED_DOMAIN_RE = /^https?:\/\/([a-zA-Z0-9-]+\.)*(vridhamma\.org|ucenlist\.org)([/?#]|$)/;

const LINK_REMOVED_NOTICE =
  "[🔒 Link removed: only official ucenlist.org and vridhamma.org links are shared]";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkify(url, text) {
  if (TRUSTED_DOMAIN_RE.test(url)) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  }
  return LINK_REMOVED_NOTICE;
}

// Placeholders protect already-rendered markdown links from the later
// bare-URL pass (which would otherwise match the URL inside href="...").
const linkPlaceholders = [];

function protectLinks(s) {
  linkPlaceholders.length = 0;
  return s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    linkPlaceholders.push(linkify(url, text));
    return `\u0000L${linkPlaceholders.length - 1}\u0000`;
  });
}

function restoreLinks(s) {
  return s.replace(/\u0000L(\d+)\u0000/g, (m, i) => linkPlaceholders[Number(i)]);
}

function inline(s) {
  // Escape FIRST: raw markdown text becomes inert HTML before any tag we emit.
  let out = esc(s);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = protectLinks(out);
  out = out.replace(
    /(https?:\/\/[^\s<)"']+)/g,
    (url) => linkify(url, url)
  );
  out = restoreLinks(out);
  out = out.replace(/\[🔒 Link removed[^\]]*\]/g, (m) => `<span class="link-removed">${m}</span>`);
  return out;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isDelimiterRow(line) {
  const inner = splitRow(line).join("");
  if (inner.length === 0) return false;
  return /^[:-]+$/.test(inner);
}

// Returns { html, nextIndex } or null when the first line is not a valid table.
function buildTable(lines, start) {
  const header = splitRow(lines[start]);
  if (header.length === 0 || !lines[start + 1] || !isDelimiterRow(lines[start + 1])) {
    return null;
  }
  const rows = [];
  let i = start + 2;
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    rows.push(splitRow(lines[i]));
    i++;
  }
  const head = header.map((c) => `<th>${inline(c)}</th>`).join("");
  const body = rows
    .filter((r) => r.length > 0)
    .map((r) =>
      `<tr>${r
        .map((c, i) => `<td data-label="${esc(header[i] || "")}">${inline(c)}</td>`)
        .join("")}</tr>`
    )
    .join("");
  return { html: `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`, nextIndex: i };
}

function isBlockStart(s) {
  const t = s.trim();
  if (t === "") return true;
  if (/^#{2,6}\s/.test(t)) return true;
  if (/^(\*\*\*|---|___)\s*$/.test(t)) return true;
  if (t.startsWith("|")) return true;
  if (/^[-*+]\s/.test(t) || /^\d+[.)]\s/.test(t)) return true;
  if (t.startsWith(">")) return true;
  return false;
}

export function renderMarkdown(markdown) {
  // Block structure is classified on the RAW text so that markers like `>`
  // (blockquote) and `<` (not used) are visible; escaping happens per content
  // fragment inside inline().
  const lines = String(markdown == null ? "" : markdown).split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    const heading = trimmed.match(/^(#{2,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 6);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^(\*\*\*|---|___)\s*$/.test(trimmed)) {
      out.push("<hr>");
      i++;
      continue;
    }

    if (trimmed.startsWith("|")) {
      const table = buildTable(lines, i);
      if (table) {
        out.push(table.html);
        i = table.nextIndex;
        continue;
      }
    }

    const ul = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      const items = [ul[1]];
      i++;
      while (i < lines.length) {
        const m = lines[i].trim().match(/^[-*+]\s+(.*)$/);
        if (m) {
          items.push(m[1]);
          i++;
        } else {
          break;
        }
      }
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }

    const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      const items = [ol[1]];
      i++;
      while (i < lines.length) {
        const m = lines[i].trim().match(/^\d+[.)]\s+(.*)$/);
        if (m) {
          items.push(m[1]);
          i++;
        } else {
          break;
        }
      }
      out.push(`<ol>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ol>`);
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoted = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoted.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${quoted.map((q) => `<p>${inline(q)}</p>`).join("")}</blockquote>`);
      continue;
    }

    const para = [];
    while (i < lines.length && !isBlockStart(lines[i])) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }

  return out.join("\n");
}

export default renderMarkdown;
