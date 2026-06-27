## Why

We need to build the core Chatbot Agent that connects the existing `vipassana-ucenlist-knowledge` skill and `vipassana-course-discovery-mcp` server. This enables users to query static knowledge (rules, timetables) and discover live Vipassana courses in Vietnam through a natural language interface. This fulfills the assignment requirements for a secure, evaluation-ready agent.

## What Changes

- Implement the core chatbot agent that integrates the Google ADK and MCP.
- Connect the `vipassana-ucenlist-knowledge` skill to handle static information queries in English and Vietnamese.
- Connect the `vipassana-course-discovery-mcp` server using `MCPToolset` with `StdioServerParameters` for live course schedules.
- Add security guardrails: validate external domains (allowing only `vridhamma.org` and `ucenlist.org`) to prevent hallucinated links and slopsquatting.
- Add human-in-the-loop behavior for course registrations: provide `apply_url` but do not automate registration forms.
- Ensure the agent detects fallback schedule warnings and properly relays them.

## Capabilities

### New Capabilities
- `chatbot-agent`: The main capability that orchestrates knowledge retrieval, course discovery, and security guardrails for the agent. (Note: The spec for this already exists at `openspec/specs/chatbot-agent/spec.md`).

### Modified Capabilities
- `<existing-name>`: None

## Impact

- **New Agent Code**: We will build the agent initialization logic using the Google ADK in Python.
- **MCP Integration**: Uses stdio transport to run the existing MCP server.
- **Skills**: Integrates the existing knowledge skill.
- **Security**: Will implement domain validation and safety checks before returning URLs.
