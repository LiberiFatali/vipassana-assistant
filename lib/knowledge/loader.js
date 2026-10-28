/**
 * Dynamic knowledge base loader (Task 2.1) — port of load_knowledge_base()
 * from the original Python agent.
 *
 * Reads `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md` and any auxiliary
 * markdown files in that directory (e.g. group-sitting.md), resolved from this
 * module's own path via `import.meta.url` (NOT process.cwd(), which is unreliable
 * on Vercel). Falls back to an empty string on read failure so the agent still
 * starts without crashing.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR_PATH = fileURLToPath(
  new URL("../../.agents/skills/vipassana-ucenlist-knowledge/", import.meta.url)
);
const SKILL_MD_PATH = join(SKILL_DIR_PATH, "SKILL.md");

/** @type {string|null} */
let _cache = null;

export function loadKnowledgeBase() {
  if (_cache !== null) {
    return _cache;
  }
  try {
    const mainContent = readFileSync(SKILL_MD_PATH, "utf-8");
    const parts = [mainContent];

    try {
      const files = readdirSync(SKILL_DIR_PATH)
        .filter((file) => file.endsWith(".md") && file !== "SKILL.md" && !file.startsWith("."))
        .sort();
      for (const file of files) {
        const extra = readFileSync(join(SKILL_DIR_PATH, file), "utf-8").trim();
        if (extra) {
          parts.push(extra);
        }
      }
    } catch {
      // Ignore auxiliary directory scan errors and keep mainContent
    }

    _cache = parts.join("\n\n---\n\n");
  } catch {
    _cache = "";
  }
  return _cache;
}
