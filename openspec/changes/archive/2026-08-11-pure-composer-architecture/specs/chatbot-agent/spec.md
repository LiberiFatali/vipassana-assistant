## MODIFIED Requirements

### Requirement: Bilingual Knowledge Retrieval
The agent SHALL retrieve static information (Rules, Timetable, About S.N. Goenka, UCENLIST) in English or Vietnamese from the dynamically loaded knowledge skill. When the intent router classifies a request as knowledge-only, the agent SHALL answer it on the fast path: a single model composer call with the relevant knowledge sections in the detected language and no tool definitions attached.

#### Scenario: Answering static discipline rules in Vietnamese
- **WHEN** a Vietnamese-speaking user asks "Nội quy giới luật của khóa thiền 10 ngày là gì?"
- **THEN** the agent answers compassionately in Vietnamese listing the 5 Precepts (Giới) and the rules of Noble Silence (Sự Im Lặng Cao Quý), served on the fast path from the knowledge base.

#### Scenario: Answering static daily schedule in English
- **WHEN** an English-speaking user asks "What is the daily timetable during the course?"
- **THEN** the agent answers in English detailing the timetable from 4:00 AM wake-up to 10:00 PM rest, served on the fast path from the knowledge base.

### Requirement: Live Course Discovery
The agent SHALL query upcoming course schedules at Dhamma Virocana (Hanoi) and Dhamma Vutthi (HCMC) via direct Node.js server-side invocation of `listCourses`, which scrapes schedule.vridhamma.org (live → cached → fallback JSON) and returns every course record with a `data_freshness` field (`"live"` / `"cached"` / `"fallback"`). OpenCode LLM SHALL act solely as a single-turn text composer over this pre-fetched context without function tool calls (`tools: false`).

#### Scenario: Querying courses with live data freshness
- **WHEN** the user asks "Lịch các khóa thiền sắp tới ở Hà Nội?"
- **THEN** the server pre-fetches course data using `listCourses` with `center="virocana"` and `language="vi"`
- **AND** the agent composes a response detailing course dates, duration, status, and registration links without function tool calling.

#### Scenario: Querying courses with fallback data freshness
- **WHEN** the scraper fails to fetch live schedule data and returns courses with `data_freshness="fallback"` from `lib/fallback-schedule.json`
- **THEN** the agent displays the courses with the prominent warning: "⚠️ Note: These are approximate schedule dates from our fallback data. Please verify the actual dates at https://schedule.vridhamma.org before making plans."

### Requirement: Human-in-the-loop Registration Handoff
The agent SHALL act as a guide, providing information and registration links, but SHALL NOT automate registration steps or handle personal details. All registration queries SHALL be served via pre-fetched context and single-turn composition without function tool calls.

#### Scenario: Course registration handoff
- **WHEN** the user requests to register for a course
- **THEN** the agent finds an open course using pre-fetched schedule context
- **AND** provides the official `apply_url`
- **AND** instructs the user to click the link to complete the application themselves ("Please click the link above to complete your registration on the official VRI website. The registration form must be filled in by you directly.").

### Requirement: Dynamic Knowledge Base Integration
The chatbot system SHALL dynamically load the `SKILL.md` content from the `vipassana-ucenlist-knowledge` skill and integrate it into the prompt context. The system SHALL section the knowledge base at load time and inject only the relevant sections (plus the always-on chatbot-guide sections) in the detected language instead of the full document. All LLM calls SHALL run with `tools: false`.

#### Scenario: Answering meditation center address queries
- **WHEN** the user asks "Where is the Vipassana Hanoi center?" or "Địa chỉ trung tâm thiền Hà Nội ở đâu?"
- **THEN** the system returns the exact center address and contact phone from the knowledge base (e.g. "Số 15-17 ngõ Sala, đường Đồng Đò, thôn Minh Tân, xã Kim Anh, Hà Nội" for Dhamma Virocana).

#### Scenario: Answering course discipline rules queries
- **WHEN** the user asks about the 10-day course rules or daily timetable
- **THEN** the system returns details (e.g. 5 precepts, noble silence, wake-up at 4:00 AM) retrieved from the relevant section of the dynamically loaded `SKILL.md`.
