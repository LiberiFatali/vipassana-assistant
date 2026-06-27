from .cli_chatbot_agent import (
    TRUSTED_DOMAINS,
    sanitize_urls,
    KNOWLEDGE_SYSTEM_PROMPT,
    create_agent,
)

root_agent = create_agent()
