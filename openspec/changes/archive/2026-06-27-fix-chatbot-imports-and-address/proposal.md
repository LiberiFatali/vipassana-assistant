## Why

The current chatbot application fails to start up due to `ImportError` caused by a mismatch in module names after `chatbot_agent.py` was renamed to `cli_chatbot_agent.py`. Additionally, the chatbot is unable to provide specific address and contact details for the Hanoi meditation center because they are missing from the hardcoded `KNOWLEDGE_SYSTEM_PROMPT` in `cli_chatbot_agent.py`, even though they are fully documented in the `vipassana-ucenlist-knowledge` skill.

## What Changes

- Fix import paths in `chatbot_agent/agent.py` and `chatbot_agent/__init__.py` to refer to `cli_chatbot_agent` instead of `chatbot_agent`.
- Modify `chatbot_agent/cli_chatbot_agent.py` to dynamically load `SKILL.md` from the `.agents/skills/vipassana-ucenlist-knowledge` skill folder, completely replacing the hardcoded `## KNOWLEDGE BASE` section to handle all static/informational queries dynamically.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `chatbot-agent`: The agent must now load its entire knowledge base dynamically from `SKILL.md` rather than using hardcoded values, ensuring all static queries (rules, timetable, centers, history) use up-to-date data.

## Impact

- `chatbot_agent/agent.py` and `chatbot_agent/__init__.py` (import fixes).
- `chatbot_agent/cli_chatbot_agent.py` (dynamic loading of `SKILL.md` contents).
