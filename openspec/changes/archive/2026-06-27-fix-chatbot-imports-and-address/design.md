## Context

The chatbot agent relies on a hardcoded, simplified version of the knowledge base inside its system prompt in `cli_chatbot_agent.py`. This leaves out key detailed info such as physical addresses and telephone numbers of the meditation centers (e.g., Dhamma Virocana in Hanoi), which exist in the `vipassana-ucenlist-knowledge` skill's `SKILL.md` file. Furthermore, startup is broken due to outdated imports referencing the old `chatbot_agent.chatbot_agent` module name.

## Goals / Non-Goals

**Goals:**
- Fix the startup crash by correcting the imports to reference `cli_chatbot_agent`.
- Dynamically read `SKILL.md` at runtime and integrate it into the agent's system instruction context, replacing the static, hardcoded `## KNOWLEDGE BASE` section entirely.

**Non-Goals:**
- Keeping any hardcoded static knowledge base in `cli_chatbot_agent.py`.
- Changing the core behavior or configuration of the MCP tools.

## Decisions

### Decision 1: Dynamic Loading of SKILL.md and Complete Replacement
We will load `SKILL.md` from the `.agents/skills/vipassana-ucenlist-knowledge` directory relative to the `cli_chatbot_agent.py` file location and completely replace the hardcoded static `## KNOWLEDGE BASE` in the system instructions.
- **Why**: This ensures that all static queries (Vipassana definition, Goenka bio, code of discipline, timetable, centers, addresses, and registration instructions) are served dynamically from the single source of truth (`SKILL.md`). Any future update to `SKILL.md` will instantly propagate to the chatbot without needing any code changes.
- **Alternatives Considered**: 
  - *Hardcoding address info*: Rejected as it violates the single source of truth.
  - *Reading via absolute path*: Rejected as it breaks portability.

### Decision 2: Context Concatenation
We will define a helper function `load_knowledge_base() -> str` that reads the file. In `create_agent()`, we will concatenate `KNOWLEDGE_SYSTEM_PROMPT` (excluding the old hardcoded `## KNOWLEDGE BASE` sections) with the dynamically loaded `SKILL.md` contents.
- **Why**: Keeps the general instructions, bilingual rules, and security guidelines intact, while injecting the complete, live `SKILL.md` as the source of truth for the knowledge base.


## Risks / Trade-offs

- [Risk] `SKILL.md` is missing or inaccessible at runtime → [Mitigation] Handle the `FileNotFoundError` or other read exceptions gracefully by falling back to the hardcoded base prompt.
