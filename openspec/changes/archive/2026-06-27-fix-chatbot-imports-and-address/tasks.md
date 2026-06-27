## 1. Import Path Fixes

- [x] 1.1 Update `chatbot_agent/agent.py` to import `create_agent` from `chatbot_agent.cli_chatbot_agent`
- [x] 1.2 Update `chatbot_agent/__init__.py` to import all required assets and function from `.cli_chatbot_agent`

## 2. Dynamic Knowledge Loading

- [x] 2.1 Implement `load_knowledge_base()` function in `chatbot_agent/cli_chatbot_agent.py` to resolve and read `SKILL.md` from the knowledge skill directory
- [x] 2.2 Update `create_agent()` in `chatbot_agent/cli_chatbot_agent.py` to combine the default instructions with the dynamically loaded `SKILL.md` contents

## 3. Verification

- [x] 3.1 Run tests/validation to ensure no import errors exist and the chatbot starts successfully
- [x] 3.2 Verify the Hanoi center address query returns the specific physical address
