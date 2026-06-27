## Context

The Vipassana UCENLIST Chatbot Agent connects static knowledge retrieval with live course discovery. The existing `vipassana-ucenlist-knowledge` skill has been implemented as a knowledge base and the `vipassana-course-discovery-mcp` provides a standard MCP interface via stdio. We need to build the main agent using the Google ADK in Python to utilize these components securely and efficiently.

## Goals / Non-Goals

**Goals:**
- Create the chatbot agent using the Google ADK.
- Integrate the knowledge skill and MCP server.
- Implement domain validation for external links.
- Apply human-in-the-loop registration patterns.
- Ensure language consistency logic for bilingual support.

**Non-Goals:**
- Modifying the underlying scraping logic in the MCP server.
- Modifying the content of the knowledge base.
- Building a UI for the agent.

## Decisions

- **ADK Framework**: We will use the Google ADK and `Agents CLI` to define the agent. This allows seamless integration with MCP servers using `MCPToolset` and skills.
- **Security Check Mechanism**: We will add a post-processing or system-level prompt constraint to enforce Safe Domain Gating (only allowing `ucenlist.org` and `vridhamma.org`).
- **MCP Connection**: Use `StdioServerParameters(command="vipassana-mcp")`.
- **Human-in-the-loop**: We will rely on prompt engineering and output validation to ensure the agent only gives URLs and instructs the user to click, rather than attempting to automate clicks.

## Risks / Trade-offs

- **Risk: MCP server path resolution** → Ensure `vipassana-mcp` is in the environment path where the agent runs.
- **Risk: Prompt injection bypassing domain gating** → Use strict regex or a separate validation layer before outputting URLs to the user, acting as a "Blue Team" check.
