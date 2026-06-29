## Context

Currently, the chatbot agent runs via a command-line interface or exposes API endpoints via FastAPI. We need a web-based chat interface built using Streamlit that acts as a client for the Vipassana chatbot agent. The web application will run in a containerized environment (Docker) and deploy to Google Cloud Run.

## Goals / Non-Goals

**Goals:**
- Provide a clean, modern, and responsive chat interface.
- Integrate the existing `vipassana_ucenlist_chatbot` agent directly.
- Preserve and render the custom safety warnings and domain gating.
- Update/add deployment files to support running the Streamlit application in a container.

**Non-Goals:**
- Modifying the underlying agent's prompt, tools, or logic.
- Building a multi-tenant user authentication system (out of scope for this change).

## Decisions

### Decision 1: Direct Agent Integration vs API Proxying
- **Option A**: Have the Streamlit application call the FastAPI endpoints.
- **Option B (Chosen)**: Direct integration. Streamlit imports `create_agent` from `chatbot_agent.cli_chatbot_agent` and runs it in-memory.
- **Rationale**: Option B is simpler, more self-contained, and reduces latency and architecture complexity. It does not require running two services (FastAPI and Streamlit) side-by-side in production.

### Decision 2: Deployment Port Configuration
- **Option A**: Run Streamlit on the default port 8501.
- **Option B (Chosen)**: Configure Streamlit to listen on the port specified by the `PORT` environment variable (defaulting to 8080 for Cloud Run compatibility).
- **Rationale**: Cloud Run requires containerized apps to listen on the port specified by `$PORT`.

## Risks / Trade-offs

- **Risk**: Streamlit's execution model re-runs the entire script on user interaction, which could recreate the agent.
- **Mitigation**: Cache the agent instance and use `st.session_state` to maintain the chat history and ADK agent session details.
