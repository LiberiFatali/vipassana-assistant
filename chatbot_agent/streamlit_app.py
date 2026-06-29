import asyncio
import streamlit as st
from google.genai import types
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from chatbot_agent.cli_chatbot_agent import create_agent, sanitize_urls

# Page Config
st.set_page_config(
    page_title="Vipassana UCENLIST Chatbot",
    page_icon="🧘",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Premium Theme Styling via Custom CSS
st.markdown("""
<style>
    .reportview-container {
        background: #111827;
    }
    .main {
        background: #0f172a;
        color: #f1f5f9;
    }
    .stButton > button {
        border-radius: 8px;
        background-color: #3b82f6;
        color: white;
        border: none;
        padding: 8px 16px;
        transition: all 0.3s ease;
    }
    .stButton > button:hover {
        background-color: #2563eb;
        transform: translateY(-2px);
    }
    .fallback-warning {
        background-color: rgba(245, 158, 11, 0.15);
        border-left: 5px solid #f59e0b;
        color: #fef08a;
        padding: 15px;
        border-radius: 8px;
        margin: 10px 0;
    }
</style>
""", unsafe_allow_html=True)

# Cache Agent, Session Service, and Runner
@st.cache_resource
def get_chatbot_resources():
    agent = create_agent()
    session_service = InMemorySessionService()
    runner = Runner(
        agent=agent,
        app_name="vipassana-ucenlist-chatbot",
        session_service=session_service,
    )
    return runner, session_service

runner, session_service = get_chatbot_resources()

# Initialize session state for language, chat, and ADK session
if "lang" not in st.session_state:
    st.session_state.lang = "vi"  # Default is Vietnamese

if "messages" not in st.session_state:
    st.session_state.messages = []

if "adk_session_id" not in st.session_state:
    async def create_adk_session():
        session = await session_service.create_session(
            app_name="vipassana-ucenlist-chatbot",
            user_id="streamlit_user",
        )
        return session.id
    st.session_state.adk_session_id = asyncio.run(create_adk_session())

# Localization Dictionary
LOCALIZATION = {
    "en": {
        "title": "💭 Vipassana UCENLIST Chatbot",
        "caption": "Ask about Vipassana meditation courses, Code of Discipline, or upcoming schedules in Vietnam.",
        "welcome": "Welcome to the Vipassana meditation assistant by the UNESCO Center for Life Skills Training (UCENLIST) in Vietnam.",
        "bilingual_support": "Bilingual Support",
        "bilingual_info": "💡 You can type in English or Vietnamese. The chatbot will reply in the language you choose.",
        "centers_header": "Dhamma Centers",
        "centers_list": "- **Dhamma Virocana**: Soc Son, Ha Noi\n- **Dhamma Vutthi**: Cu Chi, Ho Chi Minh City",
        "links_header": "Official Links",
        "clear_btn": "🔄 Clear Conversation",
        "input_placeholder": "Type your message here...",
        "thinking": "Thinking..."
    },
    "vi": {
        "title": "💭 Chatbot Vipassana UCENLIST",
        "caption": "Hỏi về các khóa thiền Vipassana, Quy tắc Giới luật, hoặc lịch khóa thiền sắp tới tại Việt Nam.",
        "welcome": "Chào mừng bạn đến với trợ lý thiền Vipassana của Trung tâm Đào tạo Kỹ năng sống UNESCO (UCENLIST) tại Việt Nam.",
        "bilingual_support": "Hỗ trợ song ngữ",
        "bilingual_info": "💡 Bạn có thể nhập bằng tiếng Anh hoặc tiếng Việt. Chatbot sẽ phản hồi bằng ngôn ngữ bạn chọn.",
        "centers_header": "Trung tâm Thiền",
        "centers_list": "- **Dhamma Virocana**: Sóc Sơn, Hà Nội\n- **Dhamma Vutthi**: Củ Chi, TP. Hồ Chí Minh",
        "links_header": "Liên kết chính thức",
        "clear_btn": "🔄 Xóa cuộc trò chuyện",
        "input_placeholder": "Nhập tin nhắn của bạn ở đây...",
        "thinking": "Đang suy nghĩ..."
    }
}

lang = st.session_state.lang
loc = LOCALIZATION[lang]

# Sidebar layout
with st.sidebar:
    st.title("🧘 UCENLIST")
    
    # Language switch button
    if st.button("🇺🇸 Switch to English" if lang == "vi" else "🇻🇳 Chuyển sang Tiếng Việt"):
        st.session_state.lang = "en" if lang == "vi" else "vi"
        st.rerun()
        
    st.write(loc["welcome"])
    
    st.subheader(loc["bilingual_support"])
    st.info(loc["bilingual_info"])
    
    st.subheader(loc["centers_header"])
    st.markdown(loc["centers_list"])
    
    st.subheader(loc["links_header"])
    st.markdown("""
    - 🌐 [ucenlist.org](https://ucenlist.org)
    - 📅 [schedule.vridhamma.org](https://schedule.vridhamma.org)
    """)
    
    if st.button(loc["clear_btn"]):
        st.session_state.messages = []
        async def reset_adk_session():
            session = await session_service.create_session(
                app_name="vipassana-ucenlist-chatbot",
                user_id="streamlit_user",
            )
            return session.id
        st.session_state.adk_session_id = asyncio.run(reset_adk_session())
        st.rerun()

st.title(loc["title"])
st.caption(loc["caption"])

# Display existing chat messages
for msg in st.session_state.messages:
    with st.chat_message(msg["role"]):
        st.markdown(msg["content"])

# Async function to process agent run
async def run_agent_message(user_input: str) -> str:
    content = types.Content(
        role="user",
        parts=[types.Part(text=user_input)],
    )
    response_text = ""
    async for event in runner.run_async(
        user_id="streamlit_user",
        session_id=st.session_state.adk_session_id,
        new_message=content,
    ):
        if event.is_final_response() and event.content:
            for part in event.content.parts:
                if part.text:
                    response_text += part.text
    return sanitize_urls(response_text)

# Input for new messages
if user_query := st.chat_input(loc["input_placeholder"]):
    # Display user message
    st.session_state.messages.append({"role": "user", "content": user_query})
    with st.chat_message("user"):
        st.markdown(user_query)
        
    # Get response
    with st.chat_message("assistant"):
        with st.spinner(loc["thinking"]):
            try:
                response = asyncio.run(run_agent_message(user_query))
                st.markdown(response)
                st.session_state.messages.append({"role": "assistant", "content": response})
            except Exception as e:
                error_msg = f"An error occurred: {str(e)}"
                st.error(error_msg)
                st.session_state.messages.append({"role": "assistant", "content": error_msg})
