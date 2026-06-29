## Why

Currently, the Vipassana chatbot agent is only accessible via a CLI interface or a raw FastAPI endpoint. A Streamlit-based web interface will provide a visually appealing, interactive, and user-friendly interface for end users to chat with the agent, browse upcoming courses, and get registration guidance.

## What Changes

- Add a new Streamlit application file (`chatbot_agent/streamlit_app.py`) for the web chat interface.
- Add `streamlit` as a dependency in `pyproject.toml`.
- Configure Streamlit app settings (e.g., chat history, custom styling, error handling, session management).
- Add deployment options: a new Dockerfile or updated deployment config to deploy the Streamlit application to Cloud Run.

## Capabilities

### New Capabilities
- `streamlit-ui`: Interactive Streamlit Web UI enabling end users to converse with the Vipassana UCENLIST chatbot, discover courses, and receive official registration links.

### Modified Capabilities
<!-- None -->

## Impact

- **Dependencies**: `pyproject.toml` will require `streamlit`.
- **Files**: New `chatbot_agent/streamlit_app.py` script.
- **Deployment**: A new deployment configuration / Docker target or updated `Dockerfile` to expose the Streamlit UI (default port 8501 or 8080).
