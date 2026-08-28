const SECTION_HEADER_RE = /^## (\d{1,2})(-VI)?\.\s+(.+)$/;

/**
 * Split SKILL.md text into numbered sections.
 * Returns [{ id, vi, title, header, text }].
 * @param {unknown} md
 * @returns {{id:number, vi:boolean, title:string, header:string, text:string}[]}
 */
export function parseSections(md) {
  const lines = String(md || "").split("\n");
  /** @type {{id:number, vi:boolean, title:string, header:string, text:string[]}[]} */
  const sections = [];
  /** @type {{id:number, vi:boolean, title:string, header:string, text:string[]}|null} */
  let current = null;

  for (const line of lines) {
    const m = SECTION_HEADER_RE.exec(line);
    if (m) {
      if (current) {
        sections.push(current);
      }
      current = {
        id: Number(m[1]),
        vi: Boolean(m[2]),
        title: m[3].trim(),
        header: line.trim(),
        text: [],
      };
    } else if (current) {
      current.text.push(line);
    }
  }
  if (current) {
    sections.push(current);
  }

  return sections.map((s) => ({ ...s, text: s.text.join("\n").trim() }));
}
