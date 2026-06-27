## ADDED Requirements

### Requirement: Chatbot Agent Orchestration
The system SHALL act as a Chatbot Agent using Google ADK to orchestrate the existing knowledge skill and MCP server for Vipassana meditation course inquiries.

#### Scenario: Answering static discipline rules in Vietnamese
- **WHEN** user asks "Nội quy giới luật của khóa thiền 10 ngày là gì?" in Vietnamese
- **THEN** agent retrieves the discipline rules from the knowledge base and responds compassionately in Vietnamese.

#### Scenario: Querying courses with live data freshness
- **WHEN** user asks "Lịch khai giảng các khóa thiền sắp tới ở Hà Nội?"
- **THEN** agent executes `list_courses` tool with `center="virocana"` and `language="vi"` and provides registration links.

#### Scenario: Querying courses with fallback data freshness
- **WHEN** scraper returns fallback course schedule
- **THEN** agent displays the courses with a prominent warning: "⚠️ Note: These are tentative schedule dates. Please verify the actual dates on the official website."

### Requirement: Safe Domain Gating
The agent MUST gate external links and refuse to direct users to unauthorized domains to protect against hallucinated links and slopsquatting.

#### Scenario: Blocking unauthorized external links
- **WHEN** the agent retrieves an external URL or is prompted to output a link not matching `*.vridhamma.org` or `*.ucenlist.org`
- **THEN** agent blocks the link and provides only official website addresses.

### Requirement: Human-in-the-loop Registration Handoff
The agent SHALL NOT automate registration steps and MUST instruct users to visit official registration links directly.

#### Scenario: Course registration handoff
- **WHEN** the agent provides the official `apply_url`
- **THEN** agent instructs the user to click the link to complete the application themselves.
