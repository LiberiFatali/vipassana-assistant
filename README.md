# vipassana-ucenlist-agent

The Vipassana UCENLIST Chatbot Agent — a bilingual AI assistant for querying Vipassana meditation course information and live schedules at UCENLIST centers in Vietnam.

## Features

- **Bilingual**: responds in Vietnamese or English based on the user's language
- **Static knowledge**: information about Vipassana, S.N. Goenka, Code of Discipline, daily timetable, and UCENLIST organization
- **Live course discovery**: queries `vipassana-course-discovery-mcp` for upcoming course schedules at Dhamma Virocana (Hà Nội) and Dhamma Vutthi (HCMC)
- **Secure**: Safe Domain Gating — only `ucenlist.org` and `*.vridhamma.org` links are ever shared
- **Human-in-the-loop**: registration is always delegated to the user via the official VRI link

## Setup

```bash
# 1. Create virtual environment with uv (from repo root)
uv venv
source .venv/bin/activate

# 2. Install the chatbot agent dependencies
uv pip install -e .

# 3. Install and register the MCP server (separate package, sibling directory)
cd vipassana-course-discovery-mcp
pip install -e .
cd ..

# 4. Set up API credentials
cp chatbot_agent/.env.example chatbot_agent/.env
# Edit chatbot_agent/.env and add your GOOGLE_API_KEY
```

## Running

```bash
source .venv/bin/activate
python -m chatbot_agent.cli_chatbot_agent
```

## Running Evaluations

```bash
python chatbot_agent/eval_agent.py
```

Evaluations test:
- Domain gating (untrusted links are stripped)
- Bilingual language routing
- Fallback schedule warning
- Human-in-the-loop registration handoff
- Prompt injection defense

## Architecture

```
chatbot_agent/cli_chatbot_agent.py
├── KNOWLEDGE_SYSTEM_PROMPT   # vipassana-ucenlist-knowledge skill (embedded)
├── create_mcp_toolset()      # connects to vipassana-course-discovery-mcp via stdio
├── create_agent()            # Google ADK Agent with model, tools, and system prompt
├── sanitize_urls()           # Safe Domain Gating post-processor (Blue Team check)
└── main()                    # Interactive CLI session loop
```

## Security

The agent enforces two layers of domain gating:
1. **System prompt instruction** — tells the LLM it must never output untrusted URLs
2. **`sanitize_urls()` post-processor** — programmatically strips any URL that doesn't match `ucenlist.org` or `vridhamma.org` from every response before display
