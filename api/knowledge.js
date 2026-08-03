/**
 * Dynamic knowledge base loader (Task 2.1) — port of load_knowledge_base()
 * from the original Python agent.
 *
 * Reads `.agents/skills/vipassana-ucenlist-knowledge/SKILL.md` at first use,
 * resolved from this module's own path via `import.meta.url` (NOT
 * process.cwd(), which is unreliable on Vercel). Falls back to an empty string
 * on read failure so the agent still starts without crashing.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SKILL_MD_PATH = fileURLToPath(
  new URL("../.agents/skills/vipassana-ucenlist-knowledge/SKILL.md", import.meta.url)
);

let _cache = null;

export function loadKnowledgeBase() {
  if (_cache !== null) {
    return _cache;
  }
  try {
    _cache = readFileSync(SKILL_MD_PATH, "utf-8");
  } catch {
    _cache = "";
  }
  return _cache;
}
