## 1. Setup Chatbot Project

- [x] 1.1 Scaffold a new Python script for the chatbot agent (`chatbot_agent.py`) using Google ADK.
- [x] 1.2 Import `MCPToolset` and `StdioServerParameters` for MCP connection.
- [x] 1.3 Configure the `vipassana-ucenlist-knowledge` skill integration.

## 2. Implement Core Agent

- [x] 2.1 Instantiate the ADK Agent with the appropriate LLM model and system instructions.
- [x] 2.2 Wire up the `vipassana-course-discovery-mcp` via `MCPToolset`.
- [x] 2.3 Implement the prompt engineering layer to handle Bilingual support correctly based on user input language.

## 3. Implement Security and Evaluation Guards

- [x] 3.1 Implement a pre/post-processing hook or strong system prompt constraint to validate all external URLs, enforcing Safe Domain Gating (`ucenlist.org` and `vridhamma.org`).
- [x] 3.2 Add specific instructions to enforce human-in-the-loop behavior for registrations, preventing automated form filling.
- [x] 3.3 Create a unit test or evaluation script (`eval_agent.py`) to simulate user inputs, prompt injection attempts, and fallback schedule handling.

## 4. Verification

- [x] 4.1 Run the evaluation script to ensure domain gating prevents hallucinated links.
- [x] 4.2 Validate bilingual query matching (e.g. asking for Hanoi courses in Vietnamese triggers `language="vi"`).
- [x] 4.3 Trigger a fallback schedule scenario manually to verify the warning is relayed properly.
