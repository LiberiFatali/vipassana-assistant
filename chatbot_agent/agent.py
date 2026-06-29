from chatbot_agent.cli_chatbot_agent import create_agent

root_agent = create_agent()

from google.adk.apps import App

app = App(root_agent=root_agent, name="chatbot_agent")
